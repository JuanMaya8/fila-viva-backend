import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  QueueEventPayload,
  QueueEvents,
} from '../../common/events/queue-events';
import { ServiceType } from './entities/service-type.entity';
import { ServiceStep } from './entities/service-step.entity';
import {
  CreateServiceTypeDto,
  ServiceStepDto,
} from './dto/create-service-type.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';

@Injectable()
export class ServiceTypesService {
  constructor(
    @InjectRepository(ServiceType)
    private readonly serviceTypesRepository: Repository<ServiceType>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    institutionId: string,
    dto: CreateServiceTypeDto,
  ): Promise<ServiceType> {
    await this.assertPrefixFree(institutionId, dto.prefix);
    const serviceType = this.serviceTypesRepository.create({
      institutionId,
      name: dto.name,
      description: dto.description ?? '',
      prefix: dto.prefix,
      avgServiceTimeMinutes: dto.avgServiceTimeMinutes,
      steps: this.buildSteps(dto.steps, []),
    });
    const saved = await this.serviceTypesRepository.save(serviceType);
    this.emitChanged(institutionId);
    return this.findOne(saved.id, institutionId);
  }

  async update(
    id: string,
    institutionId: string,
    dto: UpdateServiceTypeDto,
  ): Promise<ServiceType> {
    const serviceType = await this.findOne(id, institutionId);
    if (dto.prefix && dto.prefix !== serviceType.prefix) {
      await this.assertPrefixFree(institutionId, dto.prefix);
    }
    Object.assign(serviceType, {
      name: dto.name ?? serviceType.name,
      description: dto.description ?? serviceType.description,
      prefix: dto.prefix ?? serviceType.prefix,
      avgServiceTimeMinutes:
        dto.avgServiceTimeMinutes ?? serviceType.avgServiceTimeMinutes,
      active: dto.active ?? serviceType.active,
    });
    if (dto.steps) {
      serviceType.steps = this.buildSteps(dto.steps, serviceType.steps);
    }
    await this.serviceTypesRepository.save(serviceType);
    this.emitChanged(institutionId);
    return this.findOne(id, institutionId);
  }

  findAll(institutionId: string, onlyActive: boolean): Promise<ServiceType[]> {
    return this.serviceTypesRepository.find({
      where: { institutionId, ...(onlyActive ? { active: true } : {}) },
      relations: { steps: true },
      order: { avgServiceTimeMinutes: 'ASC', steps: { position: 'ASC' } },
    });
  }

  findByIds(institutionId: string, ids: string[]): Promise<ServiceType[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.serviceTypesRepository.find({
      where: { institutionId, id: In(ids) },
    });
  }

  async findOne(id: string, institutionId?: string): Promise<ServiceType> {
    const serviceType = await this.serviceTypesRepository.findOne({
      where: { id, ...(institutionId ? { institutionId } : {}) },
      relations: { steps: true },
      order: { steps: { position: 'ASC' } },
    });
    if (!serviceType) {
      throw new NotFoundException(`Service type ${id} not found`);
    }
    return serviceType;
  }

  /** Keeps ids of steps that still exist so recorded progress stays valid. */
  private buildSteps(
    steps: ServiceStepDto[],
    existing: ServiceStep[],
  ): ServiceStep[] {
    const byId = new Map(existing.map((step) => [step.id, step]));
    return steps.map((step, index) => {
      const current = step.id ? byId.get(step.id) : undefined;
      const entity = current ?? new ServiceStep();
      entity.name = step.name;
      entity.position = index + 1;
      return entity;
    });
  }

  private async assertPrefixFree(institutionId: string, prefix: string) {
    const taken = await this.serviceTypesRepository.exist({
      where: { institutionId, prefix },
    });
    if (taken) {
      throw new ConflictException(`Prefix ${prefix} is already in use`);
    }
  }

  private emitChanged(institutionId: string): void {
    this.eventEmitter.emit(QueueEvents.CONFIG_CHANGED, {
      institutionId,
    } satisfies QueueEventPayload);
  }
}
