import { round1 } from '../../common/utils/time';
import {
  CongestionLevel,
  PROBE_TURN_PREFIX,
  QueuePredictionRequest,
  QueuePredictionResponse,
  QueueWaitingTurnInput,
  TurnPrediction,
} from './interfaces/prediction-result.interface';

/**
 * Fixed average used by the naive "traditional" estimate (position x fixed
 * average). Must match TRADITIONAL_AVG_SERVICE_MINUTES in fila-viva-ai.
 */
export const TRADITIONAL_AVG_SERVICE_MINUTES = 10.8;
const FALLBACK_CONFIDENCE = 40;
const NO_ADVISOR_PENALTY_MINUTES = 10;

/**
 * Call order shared by the backend ("Llamar siguiente") and the AI
 * simulation: preferential first, then oldest, then id as tie-breaker.
 */
export function compareCallOrder(
  a: Pick<QueueWaitingTurnInput, 'preferential' | 'createdAt' | 'turnId'>,
  b: Pick<QueueWaitingTurnInput, 'preferential' | 'createdAt' | 'turnId'>,
): number {
  if (a.preferential !== b.preferential) {
    return a.preferential ? -1 : 1;
  }
  const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (byTime !== 0) {
    return byTime;
  }
  return a.turnId < b.turnId ? -1 : a.turnId > b.turnId ? 1 : 0;
}

/**
 * Backend-side estimate used only when fila-viva-ai is unreachable. It is
 * deliberately simple (no learning, no simulation) and is always flagged
 * with source "fallback" so the UI can show reduced confidence.
 */
export function fallbackQueueEstimate(
  request: QueuePredictionRequest,
): QueuePredictionResponse {
  const serviceTypes = new Map(request.serviceTypes.map((t) => [t.id, t]));
  const working = request.advisors.filter((a) => a.status !== 'on_break');
  const aheadByType = new Map<string, number>();
  let worst: CongestionLevel = 'low';

  const turns: TurnPrediction[] = [...request.waitingTurns]
    .sort(compareCallOrder)
    .map((turn) => {
      const peopleAhead = aheadByType.get(turn.serviceTypeId) ?? 0;
      if (!turn.turnId.startsWith(PROBE_TURN_PREFIX)) {
        aheadByType.set(turn.serviceTypeId, peopleAhead + 1);
      }
      const avg = serviceTypes.get(turn.serviceTypeId)?.avgServiceMinutes ?? 10;
      const eligible = working.filter((a) =>
        a.serviceTypeIds.includes(turn.serviceTypeId),
      );
      const allBusy =
        eligible.length > 0 && eligible.every((a) => a.currentTurn !== null);
      const wait =
        eligible.length === 0
          ? (peopleAhead + 1) * avg + NO_ADVISOR_PENALTY_MINUTES
          : (peopleAhead * avg) / eligible.length + (allBusy ? avg / 2 : 0);
      const ratio = peopleAhead / Math.max(1, eligible.length);
      const congestionLevel: CongestionLevel =
        eligible.length === 0 || ratio > 4
          ? 'high'
          : ratio > 2
            ? 'medium'
            : 'low';
      if (
        congestionLevel === 'high' ||
        (congestionLevel === 'medium' && worst === 'low')
      ) {
        worst = congestionLevel;
      }
      return {
        turnId: turn.turnId,
        peopleAhead,
        estimatedWaitMinutes: round1(wait),
        lowerMinutes: round1(wait * 0.6),
        upperMinutes: round1(wait * 1.6 + 1),
        confidence: FALLBACK_CONFIDENCE,
        traditionalEstimateMinutes: round1(
          peopleAhead * TRADITIONAL_AVG_SERVICE_MINUTES,
        ),
        congestionLevel,
      };
    });

  const inService = request.advisors
    .filter((a) => a.currentTurn !== null)
    .map((a) => {
      const current = a.currentTurn!;
      const avg =
        serviceTypes.get(current.serviceTypeId)?.avgServiceMinutes ?? 10;
      const done =
        current.stepsTotal > 0
          ? current.stepsCompleted / current.stepsTotal
          : 0;
      const remaining = Math.max(0.5, avg * (1 - done));
      return {
        turnId: current.turnId,
        remainingMinutes: round1(remaining),
        lowerMinutes: round1(remaining * 0.6),
        upperMinutes: round1(remaining * 1.6),
        expectedTotalMinutes: round1(current.elapsedSeconds / 60 + remaining),
      };
    });

  return {
    source: 'fallback',
    modelVersion: 'fallback',
    congestionLevel: worst,
    turns,
    inService,
  };
}
