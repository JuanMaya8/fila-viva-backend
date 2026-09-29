import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TurnsService } from './turns.service';
import { Turn } from './entities/turn.entity';
import { PredictionService } from '../prediction/prediction.service';
import { AgentsService } from '../agents/agents.service';
import { TurnsGateway } from './turns.gateway';
import { TurnStatus } from '../../common/enums/turn-status.enum';

describe('TurnsService', () => {
  let service: TurnsService;
  let repositoryMock: {
    create: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
    findOne: jest.Mock;
  };

  beforeEach(async () => {
    repositoryMock = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((turn) =>
        Promise.resolve({ id: 'turn-1', createdAt: new Date(), ...turn }),
      ),
      count: jest.fn().mockResolvedValue(3),
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TurnsService,
        { provide: getRepositoryToken(Turn), useValue: repositoryMock },
        {
          provide: PredictionService,
          useValue: {
            predict: jest.fn().mockResolvedValue({
              estimatedWaitMinutes: 31,
              confidence: 87,
              traditionalEstimateMinutes: 86,
              congestionLevel: 'low',
            }),
          },
        },
        {
          provide: AgentsService,
          useValue: { countActive: jest.fn().mockResolvedValue(3) },
        },
        {
          provide: TurnsGateway,
          useValue: { broadcastQueueUpdate: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<TurnsService>(TurnsService);
  });

  it('creates a turn and returns a prediction alongside it', async () => {
    const result = await service.create({
      institutionId: 'inst-1',
      serviceTypeId: 'service-1',
    });

    expect(result.status).toBe(TurnStatus.CREATED);
    expect(result.estimatedWaitMinutes).toBe(31);
    expect(result.confidence).toBe(87);
    expect(repositoryMock.save).toHaveBeenCalled();
  });
});
