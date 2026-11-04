import { Module } from '@nestjs/common';
import { PredictionModule } from '../prediction/prediction.module';
import { QueueModule } from '../queue/queue.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [QueueModule, RealtimeModule, PredictionModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
