import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { QueueEventPayload } from '../../common/events/queue-events';
import { Agent } from '../agents/entities/agent.entity';
import {
  PROBE_TURN_PREFIX,
  QueuePredictionResponse,
} from '../prediction/interfaces/prediction-result.interface';
import { PredictionService } from '../prediction/prediction.service';
import {
  Rooms,
  RealtimeGateway,
  ServerEvents,
} from '../realtime/realtime.gateway';
import {
  QueueSnapshot,
  QueueSummary,
} from './interfaces/queue-views.interface';
import { QueueSnapshotStore } from './queue-snapshot.store';
import { QueueState, QueueStateService } from './queue-state.service';
import { QueueViewsService } from './queue-views.service';

interface PendingWork {
  turnIds: Set<string>;
  agentIds: Set<string>;
}

/**
 * Recalculation pipeline. On every queue event (EventEmitter2, 'queue.**')
 * it loads the institution state from PostgreSQL, calls fila-viva-ai ONCE
 * in batch mode (/predict/queue), stores the snapshot in Redis and pushes
 * fresh views only to the affected Socket.io rooms.
 *
 * Fan-out: one event produces one snapshot that is fanned out to many
 * rooms (every waiting turn, each queue, the display, admins, advisors).
 * With the Redis adapter each emit is also fanned out to every backend
 * instance through Redis pub/sub.
 *
 * Bursts are coalesced: while a recalculation runs, further events for the
 * same institution are merged into a single follow-up run.
 */
@Injectable()
export class QueueOrchestrator
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(QueueOrchestrator.name);
  private readonly running = new Map<string, Promise<QueueSnapshot | null>>();
  private readonly queued = new Map<string, Promise<QueueSnapshot | null>>();
  private readonly pending = new Map<string, PendingWork>();
  private readonly refreshMs: number;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly stateService: QueueStateService,
    private readonly predictionService: PredictionService,
    private readonly store: QueueSnapshotStore,
    private readonly views: QueueViewsService,
    private readonly gateway: RealtimeGateway,
    @InjectRepository(Agent)
    private readonly agents: Repository<Agent>,
    configService: ConfigService,
  ) {
    this.refreshMs =
      configService.get<number>('queue.refreshIntervalSeconds')! * 1000;
  }

  onApplicationBootstrap(): void {
    if (this.refreshMs > 0) {
      this.refreshTimer = setInterval(
        () => void this.refreshOpenQueues(),
        this.refreshMs,
      );
    }
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  @OnEvent('queue.**', { promisify: true })
  handleQueueEvent(payload: QueueEventPayload): Promise<QueueSnapshot | null> {
    return this.recalculate(payload.institutionId, payload);
  }

  /** Latest snapshot from Redis; rebuilt from PostgreSQL + AI when missing. */
  async getSnapshot(institutionId: string): Promise<QueueSnapshot | null> {
    return (
      (await this.store.get(institutionId)) ?? this.recalculate(institutionId)
    );
  }

  recalculate(
    institutionId: string,
    payload?: Partial<QueueEventPayload>,
  ): Promise<QueueSnapshot | null> {
    const work = this.pending.get(institutionId) ?? {
      turnIds: new Set<string>(),
      agentIds: new Set<string>(),
    };
    if (payload?.turnId) work.turnIds.add(payload.turnId);
    if (payload?.agentId) work.agentIds.add(payload.agentId);
    this.pending.set(institutionId, work);
    return this.schedule(institutionId);
  }

  private schedule(institutionId: string): Promise<QueueSnapshot | null> {
    const current = this.running.get(institutionId);
    if (!current) {
      const run = this.run(institutionId).finally(() =>
        this.running.delete(institutionId),
      );
      this.running.set(institutionId, run);
      return run;
    }
    const next = this.queued.get(institutionId);
    if (next) {
      return next;
    }
    const follow = current.then(() => {
      this.queued.delete(institutionId);
      return this.schedule(institutionId);
    });
    this.queued.set(institutionId, follow);
    return follow;
  }

  private async run(institutionId: string): Promise<QueueSnapshot | null> {
    const work = this.pending.get(institutionId);
    this.pending.delete(institutionId);
    try {
      const state = await this.stateService.load(institutionId);
      if (!state) {
        return null;
      }
      const request = this.stateService.toPredictionRequest(state);
      const prediction = await this.predictionService.predictQueue(request);
      const snapshot = this.buildSnapshot(state, prediction);
      await this.store.save(snapshot);
      await this.broadcast(state, snapshot, work);
      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Queue recalculation failed for ${institutionId}: ${message}`,
      );
      return null;
    }
  }

  private buildSnapshot(
    state: QueueState,
    prediction: QueuePredictionResponse,
  ): QueueSnapshot {
    const turns: QueueSnapshot['turns'] = {};
    const probes = new Map<string, QueuePredictionResponse['turns'][number]>();
    for (const turn of prediction.turns) {
      if (turn.turnId.startsWith(PROBE_TURN_PREFIX)) {
        probes.set(turn.turnId.slice(PROBE_TURN_PREFIX.length), turn);
      } else {
        turns[turn.turnId] = turn;
      }
    }
    const working = state.advisors.filter(
      (a) => a.status !== AgentStatus.ON_BREAK,
    );
    const queues: Record<string, QueueSummary> = {};
    for (const type of state.serviceTypes.filter((t) => t.active)) {
      const probe = probes.get(type.id);
      queues[type.id] = {
        serviceTypeId: type.id,
        name: type.name,
        prefix: type.prefix,
        avgServiceMinutes: type.avgServiceTimeMinutes,
        waiting: state.waiting.filter((t) => t.serviceTypeId === type.id)
          .length,
        activeAdvisors: working.filter((a) =>
          a.serviceTypes.some((t) => t.id === type.id),
        ).length,
        estimatedWaitMinutes: probe?.estimatedWaitMinutes ?? 0,
        confidence: probe?.confidence ?? 0,
        congestionLevel: probe?.congestionLevel ?? prediction.congestionLevel,
      };
    }
    return {
      institutionId: state.institution.id,
      generatedAt: state.now.toISOString(),
      source: prediction.source,
      modelVersion: prediction.modelVersion,
      congestionLevel: prediction.congestionLevel,
      turns,
      inService: Object.fromEntries(
        prediction.inService.map((item) => [item.turnId, item]),
      ),
      queues,
    };
  }

  /** Pushes fresh payloads to every affected room, and only those. */
  private async broadcast(
    state: QueueState,
    snapshot: QueueSnapshot,
    work: PendingWork | undefined,
  ): Promise<void> {
    const typeName = new Map(state.serviceTypes.map((t) => [t.id, t.name]));
    const windowByAgent = new Map(
      state.advisors.map((a) => [a.id, a.windowNumber]),
    );
    const openIds = new Set<string>();
    for (const turn of [...state.waiting, ...state.attending]) {
      openIds.add(turn.id);
      this.gateway.emitTo(
        Rooms.turn(turn.id),
        ServerEvents.TURN_UPDATE,
        this.views.turnView(
          turn,
          snapshot,
          typeName.get(turn.serviceTypeId) ?? '',
          turn.agentId ? (windowByAgent.get(turn.agentId) ?? null) : null,
        ),
      );
    }
    const closedIds = [...(work?.turnIds ?? [])].filter(
      (id) => !openIds.has(id),
    );
    for (const view of await this.views.turnViews(closedIds, snapshot)) {
      this.gateway.emitTo(Rooms.turn(view.id), ServerEvents.TURN_UPDATE, view);
    }

    for (const summary of Object.values(snapshot.queues)) {
      this.gateway.emitTo(
        Rooms.queue(summary.serviceTypeId),
        ServerEvents.QUEUE_UPDATE,
        summary,
      );
    }
    this.gateway.emitTo(
      Rooms.display(state.institution.id),
      ServerEvents.DISPLAY_UPDATE,
      this.views.displayView(state, snapshot),
    );

    const adminRoom = Rooms.admin(state.institution.id);
    if (this.gateway.hasMembers(adminRoom)) {
      this.gateway.emitTo(
        adminRoom,
        ServerEvents.DASHBOARD_UPDATE,
        await this.views.dashboardView(
          state,
          snapshot,
          await this.gateway.connectedAdvisors(state.advisors.map((a) => a.id)),
        ),
      );
    }

    const advisorIds = new Set([
      ...state.advisors.map((a) => a.id),
      ...(work?.agentIds ?? []),
    ]);
    const watched = [...advisorIds].filter((id) =>
      this.gateway.hasMembers(Rooms.advisor(id)),
    );
    if (watched.length === 0) {
      return;
    }
    const agents = await this.agents.find({
      where: { id: In(watched) },
      relations: { serviceTypes: true },
    });
    for (const agent of agents) {
      this.gateway.emitTo(
        Rooms.advisor(agent.id),
        ServerEvents.ADVISOR_UPDATE,
        await this.views.advisorView(agent, state, snapshot),
      );
    }
  }

  private async refreshOpenQueues(): Promise<void> {
    try {
      const institutionIds =
        await this.stateService.institutionsWithOpenTurns();
      await Promise.all(institutionIds.map((id) => this.recalculate(id)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Periodic queue refresh failed: ${message}`);
    }
  }
}
