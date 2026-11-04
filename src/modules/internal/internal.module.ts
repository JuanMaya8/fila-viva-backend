import { Module } from '@nestjs/common';
import { PredictionLogsModule } from '../prediction-logs/prediction-logs.module';
import { InternalController } from './internal.controller';

@Module({
  imports: [PredictionLogsModule],
  controllers: [InternalController],
})
export class InternalModule {}
