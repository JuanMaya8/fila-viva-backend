import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, MoreThan, Repository } from 'typeorm';
import { PredictionLog } from './entities/prediction-log.entity';

/** One historical attention as exposed to fila-viva-ai for retraining. */
export interface HistoryRecord {
  serviceTypeId: string;
  agentId: string | null;
  avgServiceMinutes: number;
  stepsTotal: number;
  isComplex: boolean;
  startedAt: string;
  actualServiceMinutes: number;
  predictedServiceMinutes: number | null;
  actualWaitMinutes: number;
  predictedWaitMinutes: number | null;
  traditionalWaitMinutes: number | null;
}

@Injectable()
export class PredictionLogsService {
  constructor(
    @InjectRepository(PredictionLog)
    private readonly logsRepository: Repository<PredictionLog>,
  ) {}

  record(
    manager: EntityManager,
    log: Partial<PredictionLog>,
  ): Promise<PredictionLog> {
    const repository = manager.getRepository(PredictionLog);
    return repository.save(repository.create(log));
  }

  async history(since: Date | null, limit: number): Promise<HistoryRecord[]> {
    const rows = await this.logsRepository.find({
      where: since ? { createdAt: MoreThan(since) } : {},
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map((row) => ({
      serviceTypeId: row.serviceTypeId,
      agentId: row.agentId,
      avgServiceMinutes: row.avgServiceMinutes,
      stepsTotal: row.stepsTotal,
      isComplex: row.isComplex,
      startedAt: row.startedAt.toISOString(),
      actualServiceMinutes: row.actualServiceMinutes,
      predictedServiceMinutes: row.predictedServiceMinutes,
      actualWaitMinutes: row.actualWaitMinutes,
      predictedWaitMinutes: row.predictedWaitMinutes,
      traditionalWaitMinutes: row.traditionalWaitMinutes,
    }));
  }
}
