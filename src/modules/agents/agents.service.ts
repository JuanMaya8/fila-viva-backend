import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agent } from './entities/agent.entity';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentStatusDto } from './dto/update-agent-status.dto';
import { AgentStatus } from '../../common/enums/agent-status.enum';

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(Agent)
    private readonly agentsRepository: Repository<Agent>,
  ) {}

  create(dto: CreateAgentDto): Promise<Agent> {
    const agent = this.agentsRepository.create(dto);
    return this.agentsRepository.save(agent);
  }

  findAll(institutionId?: string): Promise<Agent[]> {
    if (institutionId) {
      return this.agentsRepository.find({ where: { institutionId } });
    }
    return this.agentsRepository.find();
  }

  async findOne(id: string): Promise<Agent> {
    const agent = await this.agentsRepository.findOne({ where: { id } });
    if (!agent) {
      throw new NotFoundException(`Agent ${id} not found`);
    }
    return agent;
  }

  /**
   * Number of agents currently able to attend a turn for an institution.
   * This is one of the key inputs the prediction service uses to
   * recalculate wait times (see README.md, "Contrato con fila-viva-ai").
   */
  countActive(institutionId: string): Promise<number> {
    return this.agentsRepository.count({
      where: { institutionId, status: AgentStatus.AVAILABLE },
    });
  }

  async updateStatus(id: string, dto: UpdateAgentStatusDto): Promise<Agent> {
    const agent = await this.findOne(id);
    agent.status = dto.status;

    // TODO: publish an 'agent.status.changed' event to the message bus so
    // every active turn in this institution's queues gets recalculated
    // (see the "Bus de eventos" layer in README.md).

    return this.agentsRepository.save(agent);
  }
}
