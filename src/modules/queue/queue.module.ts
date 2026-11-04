import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agent } from '../agents/entities/agent.entity';
import { Institution } from '../institutions/entities/institution.entity';
import { PredictionLog } from '../prediction-logs/entities/prediction-log.entity';
import { PredictionModule } from '../prediction/prediction.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ServiceType } from '../service-types/entities/service-type.entity';
import { ServiceProgress } from '../turns/entities/service-progress.entity';
import { Turn } from '../turns/entities/turn.entity';
import { QueueOrchestrator } from './queue-orchestrator.service';
import { QueueSnapshotStore } from './queue-snapshot.store';
import { QueueStateService } from './queue-state.service';
import { QueueViewsService } from './queue-views.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Institution,
      ServiceType,
      Turn,
      Agent,
      ServiceProgress,
      PredictionLog,
    ]),
    PredictionModule,
    RealtimeModule,
  ],
  providers: [
    QueueStateService,
    QueueSnapshotStore,
    QueueViewsService,
    QueueOrchestrator,
  ],
  exports: [QueueOrchestrator, QueueViewsService, QueueStateService],
})
export class QueueModule {}
