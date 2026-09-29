import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Turn } from './entities/turn.entity';
import { CreateTurnDto } from './dto/create-turn.dto';
import { TurnResponseDto } from './dto/turn-response.dto';
import { TurnStatus } from '../../common/enums/turn-status.enum';
import { PredictionService } from '../prediction/prediction.service';
import { AgentsService } from '../agents/agents.service';
import { TurnsGateway } from './turns.gateway';

@Injectable()
export class TurnsService {
  constructor(
    @InjectRepository(Turn)
    private readonly turnsRepository: Repository<Turn>,
    private readonly predictionService: PredictionService,
    private readonly agentsService: AgentsService,
    private readonly turnsGateway: TurnsGateway,
  ) {}

  async create(dto: CreateTurnDto): Promise<TurnResponseDto> {
    const ticketNumber = await this.nextTicketNumber(dto.institutionId);

    const turn = this.turnsRepository.create({
      institutionId: dto.institutionId,
      serviceTypeId: dto.serviceTypeId,
      ticketNumber,
      status: TurnStatus.CREATED,
    });
    const saved = await this.turnsRepository.save(turn);

    const response = await this.buildResponse(saved);

    // TODO: publish 'turn.created' to the event bus instead of pushing
    // directly, once Kafka / Redis Streams are provisioned.
    this.turnsGateway.broadcastQueueUpdate(dto.serviceTypeId, response);

    return response;
  }

  async findQueue(serviceTypeId: string): Promise<TurnResponseDto[]> {
    const activeTurns = await this.turnsRepository.find({
      where: { serviceTypeId, status: TurnStatus.CREATED },
      order: { createdAt: 'ASC' },
    });
    return Promise.all(activeTurns.map((turn) => this.buildResponse(turn)));
  }

  async markCompleted(id: string): Promise<Turn> {
    const turn = await this.findOneOrFail(id);
    turn.status = TurnStatus.COMPLETED;
    turn.completedAt = new Date();
    const saved = await this.turnsRepository.save(turn);

    // TODO: this is the exact moment the real wait time becomes known.
    // Send { turnId, predictedWaitMinutes, actualWaitMinutes } back to
    // fila-viva-ai as feedback for retraining (README.md, stage 9).

    return saved;
  }

  private async buildResponse(turn: Turn): Promise<TurnResponseDto> {
    const peopleAhead = await this.turnsRepository.count({
      where: {
        serviceTypeId: turn.serviceTypeId,
        status: TurnStatus.CREATED,
      },
    });
    const activeAgents = await this.agentsService.countActive(
      turn.institutionId,
    );

    const prediction = await this.predictionService.predict({
      peopleAhead,
      activeAgents,
      serviceTypeId: turn.serviceTypeId,
      arrivalTime: turn.createdAt ?? new Date(),
    });

    return {
      id: turn.id,
      ticketNumber: turn.ticketNumber,
      status: turn.status,
      peopleAhead,
      estimatedWaitMinutes: prediction?.estimatedWaitMinutes ?? null,
      confidence: prediction?.confidence ?? null,
      traditionalEstimateMinutes: prediction?.traditionalEstimateMinutes ?? null,
    };
  }

  private async findOneOrFail(id: string): Promise<Turn> {
    const turn = await this.turnsRepository.findOne({ where: { id } });
    if (!turn) {
      throw new NotFoundException(`Turn ${id} not found`);
    }
    return turn;
  }

  private async nextTicketNumber(institutionId: string): Promise<number> {
    const lastTurn = await this.turnsRepository.findOne({
      where: { institutionId },
      order: { ticketNumber: 'DESC' },
    });
    return (lastTurn?.ticketNumber ?? 0) + 1;
  }
}
