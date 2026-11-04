import { ConfigService } from '@nestjs/config';
import { QueueOrchestrator } from './queue-orchestrator.service';

const institution = {
  id: 'i1',
  name: 'Banco Demo',
  timezone: 'America/Bogota',
};

function setup(predictionDelayMs = 20) {
  const state = {
    institution,
    now: new Date('2026-11-03T15:30:00Z'),
    serviceTypes: [
      {
        id: 's1',
        name: 'Consulta',
        prefix: 'C',
        active: true,
        avgServiceTimeMinutes: 3,
        steps: [],
      },
    ],
    waiting: [
      { id: 't1', serviceTypeId: 's1', agentId: null, status: 'created' },
    ],
    attending: [],
    advisors: [],
    progress: new Map(),
    speedFactors: new Map(),
  };
  const stateService = {
    load: jest.fn().mockResolvedValue(state),
    toPredictionRequest: jest.fn().mockReturnValue({}),
    institutionsWithOpenTurns: jest.fn().mockResolvedValue([]),
  };
  const predictionService = {
    predictQueue: jest.fn(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                source: 'model',
                modelVersion: 'test',
                congestionLevel: 'low',
                turns: [
                  {
                    turnId: 't1',
                    peopleAhead: 0,
                    estimatedWaitMinutes: 0,
                    lowerMinutes: 0,
                    upperMinutes: 0,
                    confidence: 99,
                    traditionalEstimateMinutes: 0,
                    congestionLevel: 'low',
                  },
                  {
                    turnId: 'probe:s1',
                    peopleAhead: 1,
                    estimatedWaitMinutes: 3,
                    lowerMinutes: 2,
                    upperMinutes: 4,
                    confidence: 80,
                    traditionalEstimateMinutes: 10.8,
                    congestionLevel: 'low',
                  },
                ],
                inService: [],
              }),
            predictionDelayMs,
          ),
        ),
    ),
  };
  const store = { save: jest.fn(), get: jest.fn().mockResolvedValue(null) };
  const views = {
    turnView: jest.fn().mockReturnValue({}),
    turnViews: jest.fn().mockResolvedValue([]),
    displayView: jest.fn().mockReturnValue({}),
    dashboardView: jest.fn(),
    advisorView: jest.fn(),
  };
  const gateway = {
    emitTo: jest.fn(),
    hasMembers: jest.fn().mockReturnValue(false),
    connectedAdvisors: jest.fn().mockResolvedValue(new Set()),
  };
  const config = {
    get: () => 0,
  } as unknown as ConfigService;
  const orchestrator = new QueueOrchestrator(
    stateService as never,
    predictionService as never,
    store as never,
    views as never,
    gateway as never,
    { find: jest.fn().mockResolvedValue([]) } as never,
    config,
  );
  return { orchestrator, predictionService, store, gateway };
}

describe('QueueOrchestrator', () => {
  it('calls the AI once per recalculation and stores the snapshot', async () => {
    const { orchestrator, predictionService, store } = setup();
    const snapshot = await orchestrator.recalculate('i1');
    expect(predictionService.predictQueue).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledWith(snapshot);
    expect(snapshot!.turns.t1.estimatedWaitMinutes).toBe(0);
    expect(snapshot!.queues.s1.estimatedWaitMinutes).toBe(3);
    expect(snapshot!.turns['probe:s1']).toBeUndefined();
  });

  it('coalesces a burst of events into one follow-up run', async () => {
    const { orchestrator, predictionService } = setup();
    const results = await Promise.all([
      orchestrator.recalculate('i1'),
      orchestrator.recalculate('i1'),
      orchestrator.recalculate('i1'),
      orchestrator.recalculate('i1'),
    ]);
    expect(predictionService.predictQueue).toHaveBeenCalledTimes(2);
    expect(results.every((r) => r !== null)).toBe(true);
  });

  it('fans out to the turn, queue and display rooms', async () => {
    const { orchestrator, gateway } = setup();
    await orchestrator.recalculate('i1');
    const rooms = gateway.emitTo.mock.calls.map((call) => call[0]);
    expect(rooms).toEqual(
      expect.arrayContaining(['turn:t1', 'queue:s1', 'display:i1']),
    );
  });

  it('serves the stored snapshot without recalculating', async () => {
    const { orchestrator, predictionService, store } = setup();
    store.get.mockResolvedValueOnce({ institutionId: 'i1' });
    await orchestrator.getSnapshot('i1');
    expect(predictionService.predictQueue).not.toHaveBeenCalled();
  });
});
