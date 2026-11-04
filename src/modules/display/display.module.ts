import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { DisplayController } from './display.controller';

@Module({
  imports: [QueueModule],
  controllers: [DisplayController],
})
export class DisplayModule {}
