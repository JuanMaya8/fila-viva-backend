import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PredictionLog } from './entities/prediction-log.entity';
import { PredictionLogsService } from './prediction-logs.service';

@Module({
  imports: [TypeOrmModule.forFeature([PredictionLog])],
  providers: [PredictionLogsService],
  exports: [PredictionLogsService],
})
export class PredictionLogsModule {}
