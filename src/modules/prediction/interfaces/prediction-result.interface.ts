/**
 * Exact contracts with the fila-viva-ai service. Keep these interfaces in
 * sync with that repository's app/schemas.py and with the JSON examples
 * documented (identically) in the three READMEs.
 */

export type CongestionLevel = 'low' | 'medium' | 'high';

/** 'model' = trained models, 'baseline' = M/M/c inside fila-viva-ai, 'fallback' = backend-side estimate when the AI is down. */
export type PredictionSource = 'model' | 'baseline' | 'fallback';

/** POST /predict — single estimate (legacy contract, kept for compatibility). */
export interface PredictionRequest {
  peopleAhead: number;
  activeAgents: number;
  serviceTypeId: string;
  arrivalTime: string;
  avgServiceMinutes?: number;
}

export interface PredictionResult {
  estimatedWaitMinutes: number;
  confidence: number;
  traditionalEstimateMinutes: number;
  congestionLevel: CongestionLevel;
}

/** POST /predict/queue — whole-institution snapshot, one call per event. */
export interface QueueServiceTypeInput {
  id: string;
  avgServiceMinutes: number;
  stepsTotal: number;
}

export interface QueueCurrentTurnInput {
  turnId: string;
  serviceTypeId: string;
  status: 'called' | 'in_service';
  elapsedSeconds: number;
  stepsCompleted: number;
  stepsTotal: number;
  isComplex: boolean;
}

export interface QueueAdvisorInput {
  id: string;
  status: 'available' | 'busy' | 'on_break';
  serviceTypeIds: string[];
  speedFactor: number;
  statusSinceSeconds: number;
  currentTurn: QueueCurrentTurnInput | null;
}

export interface QueueWaitingTurnInput {
  turnId: string;
  serviceTypeId: string;
  preferential: boolean;
  createdAt: string;
}

export interface QueuePredictionRequest {
  timestamp: string;
  utcOffsetMinutes: number;
  serviceTypes: QueueServiceTypeInput[];
  advisors: QueueAdvisorInput[];
  waitingTurns: QueueWaitingTurnInput[];
}

export interface TurnPrediction {
  turnId: string;
  peopleAhead: number;
  estimatedWaitMinutes: number;
  lowerMinutes: number;
  upperMinutes: number;
  confidence: number;
  traditionalEstimateMinutes: number;
  congestionLevel: CongestionLevel;
}

export interface InServicePrediction {
  turnId: string;
  remainingMinutes: number;
  lowerMinutes: number;
  upperMinutes: number;
  expectedTotalMinutes: number;
}

export interface QueuePredictionResponse {
  source: PredictionSource;
  modelVersion: string;
  congestionLevel: CongestionLevel;
  turns: TurnPrediction[];
  inService: InServicePrediction[];
}

/** GET /model/info */
export interface ModelInfo {
  modelVersion: string;
  trainedAt: string | null;
  source: 'model' | 'baseline';
  trainingSamples: number;
  realSamples: number;
  metrics: Record<string, number>;
}

/**
 * Waiting turns whose id starts with this prefix are hypothetical
 * "what if someone joins now" probes, one per service type. They power the
 * "espera actual estimada" shown before taking a turn.
 */
export const PROBE_TURN_PREFIX = 'probe:';
