import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PredictionGrpcClient } from './prediction-grpc.client';
import { PredictionService } from './prediction.service';

@Module({
  imports: [HttpModule],
  providers: [PredictionService, PredictionGrpcClient],
  exports: [PredictionService],
})
export class PredictionModule {}
