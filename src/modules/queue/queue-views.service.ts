import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import { TurnStatus } from '../../common/enums/turn-status.enum';
import { round1, startOfLocalDay } from '../../common/utils/time';
import { Agent } from '../agents/entities/agent.entity';
import { PredictionLog } from '../prediction-logs/entities/prediction-log.entity';
import { ServiceType } from '../service-types/entities/service-type.entity';
import { ServiceProgress } from '../turns/entities/service-progress.entity';
import { Turn } from '../turns/entities/turn.entity';
import {
  AccuracySummary,
  AdvisorCurrentTurn,
  AdvisorSummary,
  AdvisorView,
  DashboardView,
  DisplayView,
  QueueSnapshot,
  TurnView,
} from './interfaces/queue-views.interface';
import { QueueState } from './queue-state.service';

const ACCURACY_WINDOW = 200;

/** Turns snapshots + database rows into the payloads each role sees. */
@Injectable()
export class QueueViewsService {
  private readonly absentTimeoutMinutes: number;

  constructor(
    @InjectRepository(Turn)
    private readonly turns: Repository<Turn>,
    @InjectRepository(Agent)
    private readonly agents: Repository<Agent>,
    @InjectRepository(ServiceType)
    private readonly serviceTypes: Repository<ServiceType>,
    @InjectRepository(ServiceProgress)
    private readonly progress: Repository<ServiceProgress>,
    @InjectRepository(PredictionLog)
    private readonly logs: Repository<PredictionLog>,
    configService: ConfigService,
  ) {
    this.absentTimeoutMinutes = configService.get<number>(
      'queue.absentTimeoutMinutes',
    )!;
  }

  turnView(
    turn: Turn,
    snapshot: QueueSnapshot | null,
    serviceTypeName: string,
    windowNumber: number | null,
  ): TurnView {
    const base = {
      id: turn.id,
      ticketNumber: turn.ticketNumber,
      ticketCode: turn.ticketCode,
      status: turn.status,
      serviceTypeId: turn.serviceTypeId,
      serviceTypeName,
      preferential: turn.preferential,
      createdAt: turn.createdAt.toISOString(),
      calledAt: turn.calledAt?.toISOString() ?? null,
      estimatedAt: snapshot?.generatedAt ?? new Date().toISOString(),
      source: snapshot?.source ?? null,
    };
    const prediction =
      turn.status === TurnStatus.CREATED ? snapshot?.turns[turn.id] : undefined;
    if (prediction) {
      return {
        ...base,
        peopleAhead: prediction.peopleAhead,
        estimatedWaitMinutes: prediction.estimatedWaitMinutes,
        lowerMinutes: prediction.lowerMinutes,
        upperMinutes: prediction.upperMinutes,
        confidence: prediction.confidence,
        traditionalEstimateMinutes: prediction.traditionalEstimateMinutes,
        congestionLevel: prediction.congestionLevel,
        windowNumber: null,
      };
    }
    const attending =
      turn.status === TurnStatus.CALLED ||
      turn.status === TurnStatus.IN_SERVICE;
    return {
      ...base,
      peopleAhead: 0,
      estimatedWaitMinutes: attending ? 0 : null,
      lowerMinutes: attending ? 0 : null,
      upperMinutes: attending ? 0 : null,
      confidence: attending ? 100 : null,
      traditionalEstimateMinutes: attending ? 0 : null,
      congestionLevel: snapshot?.congestionLevel ?? null,
      windowNumber: attending ? windowNumber : null,
    };
  }

  /** Builds views for specific turns, loading their service type and advisor. */
  async turnViews(
    turnIds: string[],
    snapshot: QueueSnapshot | null,
  ): Promise<TurnView[]> {
    if (turnIds.length === 0) {
      return [];
    }
    const turns = await this.turns.find({
      where: { id: In(turnIds) },
      relations: { serviceType: true, agent: true },
    });
    return turns.map((turn) =>
      this.turnView(
        turn,
        snapshot,
        turn.serviceType.name,
        turn.agent?.windowNumber ?? null,
      ),
    );
  }

  displayView(state: QueueState, snapshot: QueueSnapshot): DisplayView {
    const typeById = new Map(state.serviceTypes.map((t) => [t.id, t]));
    const agentById = new Map(state.advisors.map((a) => [a.id, a]));
    return {
      institutionId: state.institution.id,
      institutionName: state.institution.name,
      generatedAt: snapshot.generatedAt,
      serving: state.attending
        .filter((turn) => turn.agentId && agentById.has(turn.agentId))
        .sort(
          (a, b) => (b.calledAt?.getTime() ?? 0) - (a.calledAt?.getTime() ?? 0),
        )
        .map((turn) => ({
          ticketCode: turn.ticketCode,
          windowNumber: agentById.get(turn.agentId!)!.windowNumber,
          status: turn.status,
        })),
      upcoming: state.waiting.slice(0, 8).map((turn) => ({
        ticketCode: turn.ticketCode,
        serviceTypeName: typeById.get(turn.serviceTypeId)?.name ?? '',
      })),
      queues: Object.values(snapshot.queues).map(
        ({ serviceTypeId, name, prefix, waiting, estimatedWaitMinutes }) => ({
          serviceTypeId,
          name,
          prefix,
          waiting,
          estimatedWaitMinutes,
        }),
      ),
    };
  }

  async dashboardView(
    state: QueueState,
    snapshot: QueueSnapshot,
    isConnected: (agentId: string) => boolean,
  ): Promise<DashboardView> {
    const institutionId = state.institution.id;
    const [allAgents, accuracy, averageActualWaitMinutesToday, recent] =
      await Promise.all([
        this.agents.find({
          where: { institutionId },
          relations: { serviceTypes: true },
          order: { windowNumber: 'ASC' },
        }),
        this.accuracy(institutionId),
        this.averageActualWaitToday(state),
        this.recentLogs(institutionId),
      ]);
    const ticketByAgent = new Map(
      state.attending
        .filter((turn) => turn.agentId)
        .map((turn) => [turn.agentId!, turn.ticketCode]),
    );
    const advisors: AdvisorSummary[] = allAgents.map((agent) => ({
      id: agent.id,
      fullName: agent.fullName,
      windowNumber: agent.windowNumber,
      status: agent.status,
      active: agent.active,
      connected: isConnected(agent.id),
      serviceTypeIds: agent.serviceTypes.map((t) => t.id),
      currentTicketCode: ticketByAgent.get(agent.id) ?? null,
    }));
    const waitingEstimates = state.waiting
      .map((turn) => snapshot.turns[turn.id]?.estimatedWaitMinutes)
      .filter((value): value is number => typeof value === 'number');
    return {
      generatedAt: snapshot.generatedAt,
      source: snapshot.source,
      modelVersion: snapshot.modelVersion,
      congestionLevel: snapshot.congestionLevel,
      waitingTotal: state.waiting.length,
      activeAdvisors: allAgents.filter(
        (a) =>
          a.active &&
          (a.status === AgentStatus.AVAILABLE || a.status === AgentStatus.BUSY),
      ).length,
      averageEstimatedWaitMinutes: waitingEstimates.length
        ? round1(
            waitingEstimates.reduce((sum, value) => sum + value, 0) /
              waitingEstimates.length,
          )
        : null,
      averageActualWaitMinutesToday,
      queues: Object.values(snapshot.queues),
      advisors,
      accuracy,
      recent,
    };
  }

  async advisorView(
    agent: Agent,
    state: QueueState | null,
    snapshot: QueueSnapshot | null,
  ): Promise<AdvisorView> {
    const serviceTypeIds = new Set(agent.serviceTypes.map((t) => t.id));
    const turn =
      state?.attending.find((t) => t.agentId === agent.id) ??
      (await this.turns.findOne({
        where: {
          agentId: agent.id,
          status: In([TurnStatus.CALLED, TurnStatus.IN_SERVICE]),
        },
      }));
    let currentTurn: AdvisorCurrentTurn | null = null;
    if (turn) {
      const [serviceType, progress] = await Promise.all([
        this.serviceTypes.findOne({
          where: { id: turn.serviceTypeId },
          relations: { steps: true },
        }),
        this.progress.findOne({ where: { turnId: turn.id } }),
      ]);
      const remaining = snapshot?.inService[turn.id];
      currentTurn = {
        id: turn.id,
        ticketCode: turn.ticketCode,
        status: turn.status,
        serviceTypeId: turn.serviceTypeId,
        serviceTypeName: serviceType?.name ?? '',
        preferential: turn.preferential,
        calledAt: turn.calledAt?.toISOString() ?? null,
        startedAt: turn.startedAt?.toISOString() ?? null,
        steps: (serviceType?.steps ?? [])
          .sort((a, b) => a.position - b.position)
          .map(({ id, name, position }) => ({ id, name, position })),
        completedStepIds: progress?.completedStepIds ?? [],
        notes: progress?.notes ?? '',
        isComplex: progress?.isComplex ?? false,
        remainingMinutes: remaining?.remainingMinutes ?? null,
        lowerMinutes: remaining?.lowerMinutes ?? null,
        upperMinutes: remaining?.upperMinutes ?? null,
        expectedTotalMinutes: remaining?.expectedTotalMinutes ?? null,
      };
    }
    return {
      id: agent.id,
      fullName: agent.fullName,
      windowNumber: agent.windowNumber,
      status: agent.status,
      serviceTypes: agent.serviceTypes
        .filter((t) => t.active)
        .map(({ id, name, prefix }) => ({ id, name, prefix })),
      currentTurn,
      queues: snapshot
        ? Object.values(snapshot.queues).filter((q) =>
            serviceTypeIds.has(q.serviceTypeId),
          )
        : [],
      absentTimeoutMinutes: this.absentTimeoutMinutes,
      generatedAt: snapshot?.generatedAt ?? new Date().toISOString(),
    };
  }

  private async accuracy(institutionId: string): Promise<AccuracySummary> {
    const [row]: Array<Record<string, string | null>> = await this.logs.query(
      `SELECT
         COUNT(*) FILTER (WHERE predicted_wait_minutes IS NOT NULL) AS "samples",
         AVG(ABS(predicted_wait_minutes - actual_wait_minutes)) AS "aiMae",
         AVG(ABS(traditional_wait_minutes - actual_wait_minutes)) AS "traditionalMae",
         COUNT(*) FILTER (WHERE predicted_service_minutes IS NOT NULL) AS "serviceSamples",
         AVG(ABS(predicted_service_minutes - actual_service_minutes)) AS "serviceAiMae",
         AVG(ABS(avg_service_minutes - actual_service_minutes)) AS "serviceBaselineMae"
       FROM (
         SELECT * FROM prediction_logs
         WHERE institution_id = $1
         ORDER BY created_at DESC
         LIMIT $2
       ) recent`,
      [institutionId, ACCURACY_WINDOW],
    );
    const num = (value: string | null | undefined) =>
      value === null || value === undefined ? null : round1(Number(value));
    const aiMae = num(row?.aiMae);
    const traditionalMae = num(row?.traditionalMae);
    return {
      samples: Number(row?.samples ?? 0),
      aiMaeMinutes: aiMae,
      traditionalMaeMinutes: traditionalMae,
      improvementPercent:
        aiMae !== null && traditionalMae !== null && traditionalMae > 0
          ? Math.round(((traditionalMae - aiMae) / traditionalMae) * 100)
          : null,
      serviceSamples: Number(row?.serviceSamples ?? 0),
      serviceAiMaeMinutes: num(row?.serviceAiMae),
      serviceBaselineMaeMinutes: num(row?.serviceBaselineMae),
    };
  }

  private async averageActualWaitToday(
    state: QueueState,
  ): Promise<number | null> {
    const startOfDay = startOfLocalDay(state.institution.timezone, state.now);
    const row = await this.turns
      .createQueryBuilder('turn')
      .select(
        'AVG(EXTRACT(EPOCH FROM (turn.called_at - turn.created_at)) / 60)',
        'avg',
      )
      .where('turn.institution_id = :id', { id: state.institution.id })
      .andWhere('turn.called_at IS NOT NULL')
      .andWhere('turn.created_at >= :startOfDay', { startOfDay })
      .getRawOne<{ avg: string | null }>();
    return row?.avg ? round1(Number(row.avg)) : null;
  }

  private async recentLogs(
    institutionId: string,
  ): Promise<DashboardView['recent']> {
    const rows = await this.logs
      .createQueryBuilder('log')
      .innerJoin(Turn, 'turn', 'turn.id = log.turn_id')
      .innerJoin(ServiceType, 'type', 'type.id = log.service_type_id')
      .select('turn.ticket_code', 'ticketCode')
      .addSelect('type.name', 'serviceTypeName')
      .addSelect('log.predicted_wait_minutes', 'predictedWaitMinutes')
      .addSelect('log.traditional_wait_minutes', 'traditionalWaitMinutes')
      .addSelect('log.actual_wait_minutes', 'actualWaitMinutes')
      .addSelect('log.created_at', 'completedAt')
      .where('log.institution_id = :institutionId', { institutionId })
      .orderBy('log.created_at', 'DESC')
      .limit(8)
      .getRawMany();
    return rows.map((row) => ({
      ticketCode: row.ticketCode,
      serviceTypeName: row.serviceTypeName,
      predictedWaitMinutes:
        row.predictedWaitMinutes === null
          ? null
          : round1(Number(row.predictedWaitMinutes)),
      traditionalWaitMinutes:
        row.traditionalWaitMinutes === null
          ? null
          : round1(Number(row.traditionalWaitMinutes)),
      actualWaitMinutes: round1(Number(row.actualWaitMinutes)),
      completedAt: new Date(row.completedAt).toISOString(),
    }));
  }
}
