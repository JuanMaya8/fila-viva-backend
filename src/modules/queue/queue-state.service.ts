import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { AgentStatus } from '../../common/enums/agent-status.enum';
import {
  ATTENDING_STATUSES,
  OPEN_STATUSES,
  TurnStatus,
} from '../../common/enums/turn-status.enum';
import { utcOffsetMinutes } from '../../common/utils/time';
import { Agent } from '../agents/entities/agent.entity';
import { Institution } from '../institutions/entities/institution.entity';
import { PredictionLog } from '../prediction-logs/entities/prediction-log.entity';
import {
  PROBE_TURN_PREFIX,
  QueueAdvisorInput,
  QueuePredictionRequest,
} from '../prediction/interfaces/prediction-result.interface';
import { ServiceType } from '../service-types/entities/service-type.entity';
import { ServiceProgress } from '../turns/entities/service-progress.entity';
import { Turn } from '../turns/entities/turn.entity';

/** Everything PostgreSQL knows about an institution's queues right now. */
export interface QueueState {
  institution: Institution;
  now: Date;
  serviceTypes: ServiceType[];
  waiting: Turn[];
  attending: Turn[];
  advisors: Agent[];
  progress: Map<string, ServiceProgress>;
  speedFactors: Map<string, number>;
}

const MIN_SPEED_SAMPLES = 3;

@Injectable()
export class QueueStateService {
  constructor(
    @InjectRepository(Institution)
    private readonly institutions: Repository<Institution>,
    @InjectRepository(ServiceType)
    private readonly serviceTypes: Repository<ServiceType>,
    @InjectRepository(Turn)
    private readonly turns: Repository<Turn>,
    @InjectRepository(Agent)
    private readonly agents: Repository<Agent>,
    @InjectRepository(ServiceProgress)
    private readonly progress: Repository<ServiceProgress>,
    @InjectRepository(PredictionLog)
    private readonly logs: Repository<PredictionLog>,
  ) {}

  async load(institutionId: string): Promise<QueueState | null> {
    const institution = await this.institutions.findOne({
      where: { id: institutionId },
    });
    if (!institution) {
      return null;
    }
    const [serviceTypes, waiting, attending, advisors, speedFactors] =
      await Promise.all([
        this.serviceTypes.find({
          where: { institutionId },
          relations: { steps: true },
          order: { avgServiceTimeMinutes: 'ASC' },
        }),
        this.turns.find({
          where: { institutionId, status: TurnStatus.CREATED },
          order: { preferential: 'DESC', createdAt: 'ASC', id: 'ASC' },
        }),
        this.turns.find({
          where: { institutionId, status: In(ATTENDING_STATUSES) },
        }),
        this.agents.find({
          where: {
            institutionId,
            active: true,
            status: Not(AgentStatus.OFFLINE),
          },
          relations: { serviceTypes: true },
          order: { windowNumber: 'ASC' },
        }),
        this.loadSpeedFactors(institutionId),
      ]);
    const progressRows = attending.length
      ? await this.progress.find({
          where: { turnId: In(attending.map((t) => t.id)) },
        })
      : [];
    return {
      institution,
      now: new Date(),
      serviceTypes,
      waiting,
      attending,
      advisors,
      progress: new Map(progressRows.map((p) => [p.turnId, p])),
      speedFactors,
    };
  }

  /** Institutions that currently have open turns (used by the periodic refresh). */
  async institutionsWithOpenTurns(): Promise<string[]> {
    const rows = await this.turns
      .createQueryBuilder('turn')
      .select('DISTINCT turn.institution_id', 'institutionId')
      .where('turn.status IN (:...statuses)', { statuses: OPEN_STATUSES })
      .getRawMany<{ institutionId: string }>();
    return rows.map((row) => row.institutionId);
  }

  /**
   * Builds the /predict/queue request. Only active service types get a
   * probe turn ("what if someone joins now"), appended after real turns.
   */
  toPredictionRequest(state: QueueState): QueuePredictionRequest {
    const now = state.now;
    const typeById = new Map(state.serviceTypes.map((t) => [t.id, t]));
    const attendingByAgent = new Map(
      state.attending
        .filter((turn) => turn.agentId)
        .map((turn) => [turn.agentId!, turn]),
    );

    const advisors: QueueAdvisorInput[] = state.advisors.map((agent) => {
      const turn = attendingByAgent.get(agent.id) ?? null;
      const progress = turn ? state.progress.get(turn.id) : undefined;
      const stepsTotal = turn
        ? (typeById.get(turn.serviceTypeId)?.steps.length ?? 0)
        : 0;
      const since =
        turn?.status === TurnStatus.IN_SERVICE
          ? turn.startedAt
          : turn?.calledAt;
      return {
        id: agent.id,
        status:
          agent.status === AgentStatus.ON_BREAK
            ? 'on_break'
            : turn
              ? 'busy'
              : 'available',
        serviceTypeIds: agent.serviceTypes.map((t) => t.id),
        speedFactor: state.speedFactors.get(agent.id) ?? 1,
        statusSinceSeconds: Math.max(
          0,
          Math.round((now.getTime() - agent.statusChangedAt.getTime()) / 1000),
        ),
        currentTurn: turn
          ? {
              turnId: turn.id,
              serviceTypeId: turn.serviceTypeId,
              status:
                turn.status === TurnStatus.IN_SERVICE ? 'in_service' : 'called',
              elapsedSeconds: since
                ? Math.max(
                    0,
                    Math.round((now.getTime() - since.getTime()) / 1000),
                  )
                : 0,
              stepsCompleted: progress?.completedStepIds.length ?? 0,
              stepsTotal,
              isComplex: progress?.isComplex ?? false,
            }
          : null,
      };
    });

    const waitingTurns = state.waiting.map((turn) => ({
      turnId: turn.id,
      serviceTypeId: turn.serviceTypeId,
      preferential: turn.preferential,
      createdAt: turn.createdAt.toISOString(),
    }));
    const probes = state.serviceTypes
      .filter((t) => t.active)
      .map((t) => ({
        turnId: `${PROBE_TURN_PREFIX}${t.id}`,
        serviceTypeId: t.id,
        preferential: false,
        createdAt: now.toISOString(),
      }));

    return {
      timestamp: now.toISOString(),
      utcOffsetMinutes: utcOffsetMinutes(state.institution.timezone, now),
      serviceTypes: state.serviceTypes.map((t) => ({
        id: t.id,
        avgServiceMinutes: t.avgServiceTimeMinutes,
        stepsTotal: t.steps.length,
      })),
      advisors,
      waitingTurns: [...waitingTurns, ...probes],
    };
  }

  /**
   * Advisor speed factor = typical (actual / configured average) duration
   * ratio over the last 30 days; 1.0 until there are enough samples.
   * Values above 1 mean slower than average.
   */
  private async loadSpeedFactors(
    institutionId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.logs
      .createQueryBuilder('log')
      .select('log.agent_id', 'agentId')
      .addSelect(
        'AVG(LEAST(GREATEST(log.actual_service_minutes / NULLIF(log.avg_service_minutes, 0), 0.3), 3))',
        'ratio',
      )
      .addSelect('COUNT(*)', 'samples')
      .where('log.institution_id = :institutionId', { institutionId })
      .andWhere('log.agent_id IS NOT NULL')
      .andWhere("log.created_at > now() - interval '30 days'")
      .groupBy('log.agent_id')
      .getRawMany<{ agentId: string; ratio: string; samples: string }>();
    return new Map(
      rows
        .filter((row) => Number(row.samples) >= MIN_SPEED_SAMPLES)
        .map((row) => [
          row.agentId,
          Math.min(1.6, Math.max(0.6, Number(row.ratio))),
        ]),
    );
  }
}
