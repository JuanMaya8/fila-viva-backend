import {
  compareCallOrder,
  fallbackQueueEstimate,
  TRADITIONAL_AVG_SERVICE_MINUTES,
} from './fallback-estimator';
import { QueuePredictionRequest } from './interfaces/prediction-result.interface';

const at = (minute: number) =>
  new Date(Date.UTC(2026, 10, 3, 15, minute)).toISOString();

function request(
  overrides: Partial<QueuePredictionRequest> = {},
): QueuePredictionRequest {
  return {
    timestamp: at(30),
    utcOffsetMinutes: -300,
    serviceTypes: [
      { id: 'c', avgServiceMinutes: 3, stepsTotal: 3 },
      { id: 'k', avgServiceMinutes: 35, stepsTotal: 6 },
    ],
    advisors: [
      {
        id: 'a1',
        status: 'available',
        serviceTypeIds: ['c', 'k'],
        speedFactor: 1,
        statusSinceSeconds: 0,
        currentTurn: null,
      },
    ],
    waitingTurns: [
      {
        turnId: 't2',
        serviceTypeId: 'c',
        preferential: false,
        createdAt: at(2),
      },
      {
        turnId: 't1',
        serviceTypeId: 'c',
        preferential: false,
        createdAt: at(1),
      },
      {
        turnId: 'vip',
        serviceTypeId: 'c',
        preferential: true,
        createdAt: at(5),
      },
      {
        turnId: 'k1',
        serviceTypeId: 'k',
        preferential: false,
        createdAt: at(0),
      },
    ],
    ...overrides,
  };
}

describe('call order', () => {
  it('puts preferential first, then the oldest, then the id', () => {
    const turns = request().waitingTurns.sort(compareCallOrder);
    expect(turns.map((t) => t.turnId)).toEqual(['vip', 'k1', 't1', 't2']);
  });
});

describe('fallbackQueueEstimate', () => {
  it('counts people ahead per service type in call order', () => {
    const result = fallbackQueueEstimate(request());
    const ahead = Object.fromEntries(
      result.turns.map((t) => [t.turnId, t.peopleAhead]),
    );
    expect(ahead).toEqual({ vip: 0, t1: 1, t2: 2, k1: 0 });
    expect(result.source).toBe('fallback');
  });

  it('keeps the traditional estimate as position x fixed average', () => {
    const t2 = fallbackQueueEstimate(request()).turns.find(
      (t) => t.turnId === 't2',
    )!;
    expect(t2.traditionalEstimateMinutes).toBeCloseTo(
      2 * TRADITIONAL_AVG_SERVICE_MINUTES,
      1,
    );
  });

  it('never returns negative waits and keeps confidence in range', () => {
    for (const turn of fallbackQueueEstimate(request()).turns) {
      expect(turn.estimatedWaitMinutes).toBeGreaterThanOrEqual(0);
      expect(turn.confidence).toBeGreaterThanOrEqual(0);
      expect(turn.confidence).toBeLessThanOrEqual(100);
    }
  });

  it('does not count probe turns as people ahead', () => {
    const base = request();
    const result = fallbackQueueEstimate({
      ...base,
      waitingTurns: [
        ...base.waitingTurns,
        {
          turnId: 'probe:c',
          serviceTypeId: 'c',
          preferential: false,
          createdAt: at(30),
        },
      ],
    });
    const probe = result.turns.find((t) => t.turnId === 'probe:c')!;
    expect(probe.peopleAhead).toBe(3);
  });

  it('penalises turns that no active advisor can attend', () => {
    const result = fallbackQueueEstimate(
      request({
        advisors: [
          {
            id: 'a1',
            status: 'on_break',
            serviceTypeIds: ['c'],
            speedFactor: 1,
            statusSinceSeconds: 0,
            currentTurn: null,
          },
        ],
      }),
    );
    expect(result.congestionLevel).toBe('high');
  });
});
