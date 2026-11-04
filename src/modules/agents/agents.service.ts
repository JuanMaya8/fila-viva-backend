import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { ATTENDING_STATUSES } from '../../common/enums/turn-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  ADVISOR_DISCONNECTED,
  ADVISOR_LOGGED_OUT,
  AdvisorPresencePayload,
  QueueEventPayload,
  QueueEvents,
} from '../../common/events/queue-events';
import { ServiceType } from '../service-types/entities/service-type.entity';
import { Turn } from '../turns/entities/turn.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { UpdateAgentStatusDto } from './dto/update-agent-status.dto';
import { Agent } from './entities/agent.entity';

/** Admin-facing view of an advisor: no password hash, no unrelated data. */
export interface AgentAdminView {
  id: string;
  fullName: string;
  email: string;
  windowNumber: number;
  status: AgentStatus;
  active: boolean;
  serviceTypeIds: string[];
}

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(Agent)
    private readonly agentsRepository: Repository<Agent>,
    @InjectRepository(Turn)
    private readonly turnsRepository: Repository<Turn>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    institutionId: string,
    dto: CreateAgentDto,
  ): Promise<AgentAdminView> {
    const serviceTypes = await this.resolveServiceTypes(
      institutionId,
      dto.serviceTypeIds,
    );
    await this.assertWindowFree(institutionId, dto.windowNumber);
    const agentId = await this.dataSource.transaction(async (manager) => {
      const user = await this.usersService.create(
        {
          institutionId,
          email: dto.email,
          fullName: dto.fullName,
          password: dto.password,
          role: UserRole.ADVISOR,
        },
        manager,
      );
      const agent = manager.getRepository(Agent).create({
        userId: user.id,
        institutionId,
        fullName: dto.fullName,
        windowNumber: dto.windowNumber,
        serviceTypes,
      });
      return (await manager.getRepository(Agent).save(agent)).id;
    });
    this.emitChanged(institutionId, agentId);
    return this.findAdminView(agentId, institutionId);
  }

  async findAll(institutionId: string): Promise<AgentAdminView[]> {
    const agents = await this.agentsRepository.find({
      where: { institutionId },
      relations: { user: true, serviceTypes: true },
      order: { windowNumber: 'ASC' },
    });
    return agents.map((agent) => this.toAdminView(agent));
  }

  async update(
    id: string,
    institutionId: string,
    dto: UpdateAgentDto,
  ): Promise<AgentAdminView> {
    const agent = await this.findOne(id, institutionId);
    if (
      dto.windowNumber !== undefined &&
      dto.windowNumber !== agent.windowNumber
    ) {
      await this.assertWindowFree(institutionId, dto.windowNumber, id);
    }
    if (dto.active === false && (await this.hasAttendingTurn(id))) {
      throw new ConflictException(
        'The advisor is attending a turn; finish it before deactivating',
      );
    }
    if (dto.serviceTypeIds) {
      agent.serviceTypes = await this.resolveServiceTypes(
        institutionId,
        dto.serviceTypeIds,
      );
    }
    agent.fullName = dto.fullName ?? agent.fullName;
    agent.windowNumber = dto.windowNumber ?? agent.windowNumber;
    if (dto.active !== undefined) {
      agent.active = dto.active;
      if (!dto.active) {
        agent.status = AgentStatus.OFFLINE;
        agent.statusChangedAt = new Date();
      }
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Agent).save(agent);
      await this.usersService.update(
        agent.userId,
        { email: dto.email, fullName: dto.fullName, active: dto.active },
        manager,
      );
    });
    this.emitChanged(institutionId, id);
    return this.findAdminView(id, institutionId);
  }

  async resetPassword(id: string, institutionId: string, password: string) {
    const agent = await this.findOne(id, institutionId);
    await this.usersService.setPassword(agent.userId, password);
    return { ok: true };
  }

  async findOne(id: string, institutionId?: string): Promise<Agent> {
    const agent = await this.agentsRepository.findOne({
      where: { id, ...(institutionId ? { institutionId } : {}) },
      relations: { serviceTypes: true },
    });
    if (!agent) {
      throw new NotFoundException(`Agent ${id} not found`);
    }
    return agent;
  }

  /** Advisor chooses Disponible or En pausa. BUSY is owned by the turn lifecycle. */
  async updateStatus(id: string, dto: UpdateAgentStatusDto): Promise<Agent> {
    const agent = await this.findOne(id);
    if (await this.hasAttendingTurn(id)) {
      throw new ConflictException(
        'Finish the current turn before changing your status',
      );
    }
    if (agent.status !== dto.status) {
      agent.status = dto.status;
      agent.statusChangedAt = new Date();
      await this.agentsRepository.save(agent);
      this.emitChanged(agent.institutionId, id);
    }
    return agent;
  }

  @OnEvent(ADVISOR_DISCONNECTED, { promisify: true })
  @OnEvent(ADVISOR_LOGGED_OUT, { promisify: true })
  async goOffline({ agentId }: AdvisorPresencePayload): Promise<void> {
    const agent = await this.agentsRepository.findOne({
      where: { id: agentId },
    });
    if (
      !agent ||
      agent.status === AgentStatus.OFFLINE ||
      (await this.hasAttendingTurn(agentId))
    ) {
      return;
    }
    agent.status = AgentStatus.OFFLINE;
    agent.statusChangedAt = new Date();
    await this.agentsRepository.save(agent);
    this.emitChanged(agent.institutionId, agentId);
  }

  private async findAdminView(id: string, institutionId: string) {
    const agent = await this.agentsRepository.findOne({
      where: { id, institutionId },
      relations: { user: true, serviceTypes: true },
    });
    if (!agent) {
      throw new NotFoundException(`Agent ${id} not found`);
    }
    return this.toAdminView(agent);
  }

  private toAdminView(agent: Agent & { user?: User }): AgentAdminView {
    return {
      id: agent.id,
      fullName: agent.fullName,
      email: agent.user?.email ?? '',
      windowNumber: agent.windowNumber,
      status: agent.status,
      active: agent.active,
      serviceTypeIds: agent.serviceTypes.map((t) => t.id),
    };
  }

  private hasAttendingTurn(agentId: string): Promise<boolean> {
    return this.turnsRepository.exist({
      where: { agentId, status: In(ATTENDING_STATUSES) },
    });
  }

  private async resolveServiceTypes(
    institutionId: string,
    ids: string[],
  ): Promise<ServiceType[]> {
    const unique = [...new Set(ids)];
    const found = await this.dataSource.getRepository(ServiceType).find({
      where: { institutionId, id: In(unique) },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException('Unknown service type in serviceTypeIds');
    }
    return found;
  }

  private async assertWindowFree(
    institutionId: string,
    windowNumber: number,
    exceptId?: string,
  ): Promise<void> {
    const owner = await this.agentsRepository.findOne({
      where: { institutionId, windowNumber, active: true },
    });
    if (owner && owner.id !== exceptId) {
      throw new ConflictException(`Window ${windowNumber} is already assigned`);
    }
  }

  private emitChanged(institutionId: string, agentId: string): void {
    this.eventEmitter.emit(QueueEvents.AGENT_STATUS_CHANGED, {
      institutionId,
      agentId,
    } satisfies QueueEventPayload);
  }
}
