import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThan, Repository } from 'typeorm';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { TurnStatus } from '../../common/enums/turn-status.enum';
import {
  QueueEventName,
  QueueEventPayload,
  QueueEvents,
} from '../../common/events/queue-events';
import { assertTransition } from '../../common/utils/turn-state-machine';
import { minutesBetween, startOfLocalDay } from '../../common/utils/time';
import { Agent } from '../agents/entities/agent.entity';
import { InstitutionsService } from '../institutions/institutions.service';
import { PredictionLogsService } from '../prediction-logs/prediction-logs.service';
import {
  QueueSnapshot,
  TurnView,
} from '../queue/interfaces/queue-views.interface';
import { QueueOrchestrator } from '../queue/queue-orchestrator.service';
import { QueueViewsService } from '../queue/queue-views.service';
import { ServiceType } from '../service-types/entities/service-type.entity';
import { CreateTurnDto } from './dto/create-turn.dto';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { ServiceProgress } from './entities/service-progress.entity';
import { Turn } from './entities/turn.entity';

const ABSENT_SWEEP_INTERVAL_MS = 15_000;

@Injectable()
export class TurnsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TurnsService.name);
  private readonly absentTimeoutMinutes: number;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Turn)
    private readonly turnsRepository: Repository<Turn>,
    @InjectRepository(ServiceType)
    private readonly serviceTypesRepository: Repository<ServiceType>,
    @InjectRepository(ServiceProgress)
    private readonly progressRepository: Repository<ServiceProgress>,
    private readonly dataSource: DataSource,
    private readonly institutionsService: InstitutionsService,
    private readonly predictionLogs: PredictionLogsService,
    private readonly orchestrator: QueueOrchestrator,
    private readonly views: QueueViewsService,
    private readonly eventEmitter: EventEmitter2,
    configService: ConfigService,
  ) {
    this.absentTimeoutMinutes = configService.get<number>(
      'queue.absentTimeoutMinutes',
    )!;
  }

  onApplicationBootstrap(): void {
    this.sweepTimer = setInterval(
      () => void this.sweepAbsent(),
      ABSENT_SWEEP_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /**
   * Public: takes a ticket. The prediction made right now is stored on the
   * turn so it can be compared with the real wait once it is called.
   * Never fails because of the AI: the orchestrator falls back on its own.
   */
  async create(dto: CreateTurnDto): Promise<TurnView> {
    const institution = await this.institutionsService.findOneOrFail(
      dto.institutionId,
    );
    const serviceType = await this.serviceTypesRepository.findOne({
      where: { id: dto.serviceTypeId, institutionId: institution.id },
    });
    if (!serviceType || !serviceType.active) {
      throw new NotFoundException(
        `Service type ${dto.serviceTypeId} not found`,
      );
    }

    const turn = await this.dataSource.transaction(async (manager) => {
      // Serialises ticket numbering per service type.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        serviceType.id,
      ]);
      const ticketNumber = await this.nextTicketNumber(
        manager,
        serviceType.id,
        institution.timezone,
      );
      const repository = manager.getRepository(Turn);
      return repository.save(
        repository.create({
          institutionId: institution.id,
          serviceTypeId: serviceType.id,
          preferential: dto.preferential ?? false,
          ticketNumber,
          ticketCode: `${serviceType.prefix}-${String(ticketNumber).padStart(3, '0')}`,
          status: TurnStatus.CREATED,
        }),
      );
    });

    const snapshot = await this.publish(QueueEvents.TURN_CREATED, {
      institutionId: institution.id,
      turnId: turn.id,
    });
    const prediction = snapshot?.turns[turn.id];
    if (prediction) {
      turn.predictedWaitMinutes = prediction.estimatedWaitMinutes;
      turn.predictedTraditionalMinutes = prediction.traditionalEstimateMinutes;
      turn.predictedConfidence = prediction.confidence;
      turn.predictionSource = snapshot!.source;
      await this.turnsRepository.update(turn.id, {
        predictedWaitMinutes: turn.predictedWaitMinutes,
        predictedTraditionalMinutes: turn.predictedTraditionalMinutes,
        predictedConfidence: turn.predictedConfidence,
        predictionSource: turn.predictionSource,
      });
    }
    return this.views.turnView(turn, snapshot, serviceType.name, null);
  }

  /** Public: live ticket. The id is an unguessable UUID. */
  async findView(id: string): Promise<TurnView> {
    const turn = await this.turnsRepository.findOne({
      where: { id },
      relations: { serviceType: true, agent: true },
    });
    if (!turn) {
      throw new NotFoundException(`Turn ${id} not found`);
    }
    let snapshot = await this.orchestrator.getSnapshot(turn.institutionId);
    if (turn.status === TurnStatus.CREATED && !snapshot?.turns[turn.id]) {
      snapshot = await this.orchestrator.recalculate(turn.institutionId);
    }
    return this.views.turnView(
      turn,
      snapshot,
      turn.serviceType.name,
      turn.agent?.windowNumber ?? null,
    );
  }

  /** Staff: one queue, each turn with its own position (not a shared count). */
  async findQueue(
    institutionId: string,
    serviceTypeId: string,
  ): Promise<TurnView[]> {
    const serviceType = await this.serviceTypesRepository.findOne({
      where: { id: serviceTypeId, institutionId },
    });
    if (!serviceType) {
      throw new NotFoundException(`Service type ${serviceTypeId} not found`);
    }
    const [turns, snapshot] = await Promise.all([
      this.turnsRepository.find({
        where: { serviceTypeId, status: TurnStatus.CREATED },
        order: { preferential: 'DESC', createdAt: 'ASC', id: 'ASC' },
      }),
      this.orchestrator.getSnapshot(institutionId),
    ]);
    return turns.map((turn, index) => ({
      ...this.views.turnView(turn, snapshot, serviceType.name, null),
      peopleAhead: index,
    }));
  }

  /** Public: the person gives up their turn (waiting or already called). */
  async cancel(id: string): Promise<TurnView> {
    const turn = await this.dataSource.transaction(async (manager) => {
      const current = await this.lockTurn(manager, id);
      assertTransition(current.status, TurnStatus.CANCELLED);
      if (current.agentId) {
        await this.releaseAgent(manager, current.agentId);
      }
      current.status = TurnStatus.CANCELLED;
      current.closedAt = new Date();
      return manager.getRepository(Turn).save(current);
    });
    await this.publish(QueueEvents.TURN_CANCELLED, {
      institutionId: turn.institutionId,
      turnId: turn.id,
      agentId: turn.agentId ?? undefined,
    });
    return this.findView(id);
  }

  /**
   * "Llamar siguiente": atomically assigns the oldest waiting turn
   * (preferential first) among the service types the advisor attends.
   * The advisor row is locked FOR UPDATE and the turn is picked with
   * FOR UPDATE SKIP LOCKED, so two advisors never get the same turn.
   */
  async callNext(agentId: string): Promise<TurnView | null> {
    const called = await this.dataSource.transaction(async (manager) => {
      const agent = await manager.getRepository(Agent).findOne({
        where: { id: agentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!agent || !agent.active) {
        throw new ForbiddenException('Advisor profile disabled');
      }
      if (agent.status !== AgentStatus.AVAILABLE) {
        throw new ConflictException(
          agent.status === AgentStatus.BUSY
            ? 'Finish the current turn before calling the next one'
            : 'Set your status to available before calling',
        );
      }
      const serviceTypeIds: string[] = (
        await manager.query(
          'SELECT service_type_id FROM agent_service_types WHERE agent_id = $1',
          [agentId],
        )
      ).map((row: { service_type_id: string }) => row.service_type_id);
      if (serviceTypeIds.length === 0) {
        return null;
      }
      const next = await manager
        .getRepository(Turn)
        .createQueryBuilder('turn')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('turn.institution_id = :institutionId', {
          institutionId: agent.institutionId,
        })
        .andWhere('turn.status = :status', { status: TurnStatus.CREATED })
        .andWhere('turn.service_type_id IN (:...serviceTypeIds)', {
          serviceTypeIds,
        })
        .orderBy('turn.preferential', 'DESC')
        .addOrderBy('turn.created_at', 'ASC')
        .addOrderBy('turn.id', 'ASC')
        .limit(1)
        .getOne();
      if (!next) {
        return null;
      }
      assertTransition(next.status, TurnStatus.CALLED);
      next.status = TurnStatus.CALLED;
      next.agentId = agent.id;
      next.calledAt = new Date();
      agent.status = AgentStatus.BUSY;
      agent.statusChangedAt = new Date();
      await manager.getRepository(Agent).save(agent);
      return manager.getRepository(Turn).save(next);
    });
    if (!called) {
      return null;
    }
    await this.publish(QueueEvents.TURN_CALLED, {
      institutionId: called.institutionId,
      turnId: called.id,
      agentId,
    });
    return this.findView(called.id);
  }

  /** The person arrived at the window: called -> in_service. */
  async start(id: string, agentId: string): Promise<TurnView> {
    const snapshotBefore = await this.orchestrator.getSnapshot(
      (await this.findOwned(id, agentId)).institutionId,
    );
    const turn = await this.dataSource.transaction(async (manager) => {
      const current = await this.lockTurn(manager, id);
      this.assertOwner(current, agentId);
      assertTransition(current.status, TurnStatus.IN_SERVICE);
      current.status = TurnStatus.IN_SERVICE;
      current.startedAt = new Date();
      current.predictedServiceMinutes =
        snapshotBefore?.inService[current.id]?.expectedTotalMinutes ?? null;
      const progressRepository = manager.getRepository(ServiceProgress);
      if (!(await progressRepository.exist({ where: { turnId: id } }))) {
        await progressRepository.save(
          progressRepository.create({ turnId: id }),
        );
      }
      return manager.getRepository(Turn).save(current);
    });
    await this.publish(QueueEvents.TURN_STARTED, {
      institutionId: turn.institutionId,
      turnId: turn.id,
      agentId,
    });
    return this.findView(id);
  }

  /** Advisor checklist, notes and "complex case" flag during the attention. */
  async updateProgress(
    id: string,
    agentId: string,
    dto: UpdateProgressDto,
  ): Promise<ServiceProgress> {
    const turn = await this.findOwned(id, agentId);
    if (turn.status !== TurnStatus.IN_SERVICE) {
      throw new ConflictException(
        'Progress can only be recorded while in service',
      );
    }
    if (dto.completedStepIds) {
      const stepIds = new Set(
        (
          await this.serviceTypesRepository.findOne({
            where: { id: turn.serviceTypeId },
            relations: { steps: true },
          })
        )?.steps.map((step) => step.id) ?? [],
      );
      if (dto.completedStepIds.some((stepId) => !stepIds.has(stepId))) {
        throw new BadRequestException('Unknown step for this service type');
      }
    }
    const progress =
      (await this.progressRepository.findOne({ where: { turnId: id } })) ??
      this.progressRepository.create({ turnId: id });
    if (dto.completedStepIds) {
      progress.completedStepIds = [...new Set(dto.completedStepIds)];
    }
    if (dto.notes !== undefined) {
      progress.notes = dto.notes;
    }
    if (dto.isComplex !== undefined) {
      progress.isComplex = dto.isComplex;
    }
    const saved = await this.progressRepository.save(progress);
    await this.publish(QueueEvents.PROGRESS_UPDATED, {
      institutionId: turn.institutionId,
      turnId: id,
      agentId,
    });
    return saved;
  }

  /** called -> absent, by the advisor or automatically after the timeout. */
  async markAbsent(id: string, agentId: string | null): Promise<TurnView> {
    const turn = await this.dataSource.transaction(async (manager) => {
      const current = await this.lockTurn(manager, id);
      if (agentId) {
        this.assertOwner(current, agentId);
      }
      assertTransition(current.status, TurnStatus.ABSENT);
      if (current.agentId) {
        await this.releaseAgent(manager, current.agentId);
      }
      current.status = TurnStatus.ABSENT;
      current.closedAt = new Date();
      return manager.getRepository(Turn).save(current);
    });
    await this.publish(QueueEvents.TURN_ABSENT, {
      institutionId: turn.institutionId,
      turnId: turn.id,
      agentId: turn.agentId ?? undefined,
    });
    return this.findView(id);
  }

  /**
   * in_service -> completed. Stores real durations next to what was
   * predicted (PredictionLog), which feeds retraining and the dashboard.
   */
  async complete(
    id: string,
    agentId: string,
    callNext: boolean,
  ): Promise<{ completed: TurnView; next: TurnView | null }> {
    const turn = await this.dataSource.transaction(async (manager) => {
      const current = await this.lockTurn(manager, id);
      this.assertOwner(current, agentId);
      assertTransition(current.status, TurnStatus.COMPLETED);
      current.status = TurnStatus.COMPLETED;
      current.completedAt = new Date();
      await this.releaseAgent(manager, agentId);
      const saved = await manager.getRepository(Turn).save(current);
      await this.recordPrediction(manager, saved);
      return saved;
    });
    await this.publish(QueueEvents.TURN_COMPLETED, {
      institutionId: turn.institutionId,
      turnId: turn.id,
      agentId,
    });
    const completed = await this.findView(id);
    const next = callNext ? await this.callNext(agentId) : null;
    return { completed, next };
  }

  private async recordPrediction(manager: EntityManager, turn: Turn) {
    const serviceType = await manager.getRepository(ServiceType).findOne({
      where: { id: turn.serviceTypeId },
      relations: { steps: true },
    });
    const progress = await manager
      .getRepository(ServiceProgress)
      .findOne({ where: { turnId: turn.id } });
    const startedAt = turn.startedAt ?? turn.calledAt ?? turn.createdAt;
    await this.predictionLogs.record(manager, {
      institutionId: turn.institutionId,
      turnId: turn.id,
      serviceTypeId: turn.serviceTypeId,
      agentId: turn.agentId,
      avgServiceMinutes: serviceType?.avgServiceTimeMinutes ?? 10,
      stepsTotal: serviceType?.steps.length ?? 0,
      isComplex: progress?.isComplex ?? false,
      predictedWaitMinutes: turn.predictedWaitMinutes,
      traditionalWaitMinutes: turn.predictedTraditionalMinutes,
      actualWaitMinutes: minutesBetween(
        turn.createdAt,
        turn.calledAt ?? startedAt,
      ),
      predictedServiceMinutes: turn.predictedServiceMinutes,
      actualServiceMinutes: minutesBetween(startedAt, turn.completedAt!),
      predictionSource: turn.predictionSource,
      startedAt,
    });
  }

  private async sweepAbsent(): Promise<void> {
    try {
      const limit = new Date(Date.now() - this.absentTimeoutMinutes * 60_000);
      const overdue = await this.turnsRepository.find({
        where: { status: TurnStatus.CALLED, calledAt: LessThan(limit) },
        select: { id: true },
      });
      for (const { id } of overdue) {
        await this.markAbsent(id, null).catch((error: unknown) => {
          if (!(error instanceof ConflictException)) {
            throw error;
          }
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Absent sweep failed: ${message}`);
    }
  }

  /** Publishes the event and waits for the recalculated snapshot. */
  private async publish(
    event: QueueEventName,
    payload: QueueEventPayload,
  ): Promise<QueueSnapshot | null> {
    const results = await this.eventEmitter.emitAsync(event, payload);
    return (
      (results.find((result) => result) as QueueSnapshot | undefined) ?? null
    );
  }

  private async releaseAgent(manager: EntityManager, agentId: string) {
    const repository = manager.getRepository(Agent);
    const agent = await repository.findOne({ where: { id: agentId } });
    if (agent && agent.status === AgentStatus.BUSY) {
      agent.status = AgentStatus.AVAILABLE;
      agent.statusChangedAt = new Date();
      await repository.save(agent);
    }
  }

  private async lockTurn(manager: EntityManager, id: string): Promise<Turn> {
    const turn = await manager.getRepository(Turn).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!turn) {
      throw new NotFoundException(`Turn ${id} not found`);
    }
    return turn;
  }

  private async findOwned(id: string, agentId: string): Promise<Turn> {
    const turn = await this.turnsRepository.findOne({ where: { id } });
    if (!turn) {
      throw new NotFoundException(`Turn ${id} not found`);
    }
    this.assertOwner(turn, agentId);
    return turn;
  }

  private assertOwner(turn: Turn, agentId: string): void {
    if (turn.agentId !== agentId) {
      throw new ForbiddenException('This turn is assigned to another advisor');
    }
  }

  private async nextTicketNumber(
    manager: EntityManager,
    serviceTypeId: string,
    timezone: string,
  ): Promise<number> {
    const startOfDay = startOfLocalDay(timezone, new Date());
    const [row] = await manager.query(
      'SELECT COALESCE(MAX(ticket_number), 0) AS max FROM turns WHERE service_type_id = $1 AND created_at >= $2',
      [serviceTypeId, startOfDay],
    );
    return Number(row.max) + 1;
  }
}
