import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstitutionsModule } from '../institutions/institutions.module';
import { PredictionLogsModule } from '../prediction-logs/prediction-logs.module';
import { QueueModule } from '../queue/queue.module';
import { ServiceType } from '../service-types/entities/service-type.entity';
import { ServiceProgress } from './entities/service-progress.entity';
import { Turn } from './entities/turn.entity';
import { TurnsController } from './turns.controller';
import { TurnsService } from './turns.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Turn, ServiceType, ServiceProgress]),
    InstitutionsModule,
    PredictionLogsModule,
    QueueModule,
  ],
  controllers: [TurnsController],
  providers: [TurnsService],
})
export class TurnsModule {}
