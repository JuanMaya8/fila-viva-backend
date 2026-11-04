import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueModule } from '../queue/queue.module';
import { Turn } from '../turns/entities/turn.entity';
import { UsersModule } from '../users/users.module';
import { Agent } from './entities/agent.entity';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Agent, Turn]), UsersModule, QueueModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
