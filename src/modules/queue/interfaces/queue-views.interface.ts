import { AgentStatus } from '../../../common/enums/agent-status.enum';
import { TurnStatus } from '../../../common/enums/turn-status.enum';
import {
  CongestionLevel,
  InServicePrediction,
  PredictionSource,
  TurnPrediction,
} from '../../prediction/interfaces/prediction-result.interface';

/** Per service type summary, cached in the snapshot and pushed to `queue:{id}`. */
export interface QueueSummary {
  serviceTypeId: string;
  name: string;
  prefix: string;
  avgServiceMinutes: number;
  waiting: number;
  activeAdvisors: number;
  /** Estimated wait for someone joining this queue right now. */
  estimatedWaitMinutes: number;
  confidence: number;
  congestionLevel: CongestionLevel;
}

/** Result of one recalculation, stored in Redis under fv:queue:{institutionId}. */
export interface QueueSnapshot {
  institutionId: string;
  generatedAt: string;
  source: PredictionSource;
  modelVersion: string;
  congestionLevel: CongestionLevel;
  turns: Record<string, TurnPrediction>;
  inService: Record<string, InServicePrediction>;
  queues: Record<string, QueueSummary>;
}

/** What a person sees on their live ticket (GET /turns/:id and `turnUpdate`). */
export interface TurnView {
  id: string;
  ticketNumber: number;
  ticketCode: string;
  status: TurnStatus;
  serviceTypeId: string;
  serviceTypeName: string;
  preferential: boolean;
  peopleAhead: number;
  estimatedWaitMinutes: number | null;
  lowerMinutes: number | null;
  upperMinutes: number | null;
  confidence: number | null;
  traditionalEstimateMinutes: number | null;
  congestionLevel: CongestionLevel | null;
  source: PredictionSource | null;
  windowNumber: number | null;
  createdAt: string;
  calledAt: string | null;
  estimatedAt: string;
}

export interface DisplayView {
  institutionId: string;
  institutionName: string;
  generatedAt: string;
  serving: Array<{
    ticketCode: string;
    windowNumber: number;
    status: TurnStatus;
  }>;
  upcoming: Array<{ ticketCode: string; serviceTypeName: string }>;
  queues: Array<
    Pick<
      QueueSummary,
      'serviceTypeId' | 'name' | 'prefix' | 'waiting' | 'estimatedWaitMinutes'
    >
  >;
}

export interface AdvisorSummary {
  id: string;
  fullName: string;
  windowNumber: number;
  status: AgentStatus;
  active: boolean;
  connected: boolean;
  serviceTypeIds: string[];
  currentTicketCode: string | null;
}

export interface AccuracySummary {
  samples: number;
  aiMaeMinutes: number | null;
  traditionalMaeMinutes: number | null;
  improvementPercent: number | null;
  serviceSamples: number;
  serviceAiMaeMinutes: number | null;
  serviceBaselineMaeMinutes: number | null;
}

export interface DashboardView {
  generatedAt: string;
  source: PredictionSource;
  modelVersion: string;
  congestionLevel: CongestionLevel;
  waitingTotal: number;
  activeAdvisors: number;
  averageEstimatedWaitMinutes: number | null;
  averageActualWaitMinutesToday: number | null;
  queues: QueueSummary[];
  advisors: AdvisorSummary[];
  accuracy: AccuracySummary;
  recent: Array<{
    ticketCode: string;
    serviceTypeName: string;
    predictedWaitMinutes: number | null;
    traditionalWaitMinutes: number | null;
    actualWaitMinutes: number;
    completedAt: string;
  }>;
}

export interface AdvisorCurrentTurn {
  id: string;
  ticketCode: string;
  status: TurnStatus;
  serviceTypeId: string;
  serviceTypeName: string;
  preferential: boolean;
  calledAt: string | null;
  startedAt: string | null;
  steps: Array<{ id: string; name: string; position: number }>;
  completedStepIds: string[];
  notes: string;
  isComplex: boolean;
  remainingMinutes: number | null;
  lowerMinutes: number | null;
  upperMinutes: number | null;
  expectedTotalMinutes: number | null;
}

export interface AdvisorView {
  id: string;
  fullName: string;
  windowNumber: number;
  status: AgentStatus;
  serviceTypes: Array<{ id: string; name: string; prefix: string }>;
  currentTurn: AdvisorCurrentTurn | null;
  queues: QueueSummary[];
  absentTimeoutMinutes: number;
  generatedAt: string;
}
