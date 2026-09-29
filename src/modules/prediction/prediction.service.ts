import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  PredictionRequest,
  PredictionResult,
} from './interfaces/prediction-result.interface';

/**
 * Thin HTTP client for the AI / prediction service (fila-viva-ai).
 *
 * This service is intentionally allowed to fail without breaking turn
 * creation: if the prediction service is unreachable, we fall back to a
 * simple queueing-theory estimate so the person always sees a number.
 * That fallback is the same "traditional" calculation the AI model is
 * compared against once it is available (see README.md).
 */
@Injectable()
export class PredictionService {
  private readonly logger = new Logger(PredictionService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl =
      this.configService.get<string>('predictionService.baseUrl') ||
      'http://localhost:8000';
  }

  async predict(request: PredictionRequest): Promise<PredictionResult> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<PredictionResult>(
          `${this.baseUrl}/predict`,
          request,
        ),
      );
      return data;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `Prediction service unavailable, falling back to a classic estimate: ${reason}`,
      );
      return this.fallbackEstimate(request);
    }
  }

  private fallbackEstimate(request: PredictionRequest): PredictionResult {
    const genericAverageServiceTime = 10; // minutes, used only as a fallback
    const activeAgents = Math.max(1, request.activeAgents);
    const estimatedWaitMinutes = Math.round(
      (request.peopleAhead / activeAgents) * genericAverageServiceTime,
    );
    const traditionalEstimateMinutes = Math.round(
      request.peopleAhead * genericAverageServiceTime,
    );

    return {
      estimatedWaitMinutes,
      confidence: 50,
      traditionalEstimateMinutes,
      congestionLevel: request.peopleAhead > activeAgents * 4 ? 'high' : 'low',
    };
  }
}
