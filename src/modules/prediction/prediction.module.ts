import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PredictionService } from './prediction.service';

@Module({
  imports: [HttpModule],
  providers: [PredictionService],
  exports: [PredictionService],
})
export class PredictionModule {}
