import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Turn } from './entities/turn.entity';
import { TurnsService } from './turns.service';
import { TurnsController } from './turns.controller';
import { TurnsGateway } from './turns.gateway';
import { PredictionModule } from '../prediction/prediction.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [TypeOrmModule.forFeature([Turn]), PredictionModule, AgentsModule],
  controllers: [TurnsController],
  providers: [TurnsService, TurnsGateway],
})
export class TurnsModule {}
