import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { fallbackQueueEstimate } from './fallback-estimator';
import { PredictionGrpcClient } from './prediction-grpc.client';
import {
  ModelInfo,
  QueuePredictionRequest,
  QueuePredictionResponse,
} from './interfaces/prediction-result.interface';

/**
 * Client for the AI / prediction service (fila-viva-ai). The batch call
 * goes over REST (default) or gRPC (PREDICTION_TRANSPORT=grpc); model info
 * and retraining always use REST.
 *
 * It is intentionally allowed to fail without breaking anything: if the
 * prediction service is unreachable or slow, predictQueue() answers with
 * the backend fallback estimate (source "fallback"), so a person always
 * sees a number and turn creation never fails because of the AI.
 */
@Injectable()
export class PredictionService {
  private readonly logger = new Logger(PredictionService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly grpcClient: PredictionGrpcClient,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService
      .get<string>('predictionService.baseUrl')!
      .replace(/\/+$/, '');
    this.timeoutMs = this.configService.get<number>(
      'predictionService.timeoutMs',
    )!;
    this.apiKey = this.configService.get<string>('internalApiKey') ?? '';
  }

  async predictQueue(
    request: QueuePredictionRequest,
  ): Promise<QueuePredictionResponse> {
    try {
      if (this.grpcClient.enabled) {
        return await this.grpcClient.predictQueue(request, this.timeoutMs);
      }
      const { data } = await firstValueFrom(
        this.httpService.post<QueuePredictionResponse>(
          `${this.baseUrl}/predict/queue`,
          request,
          { headers: this.headers(), timeout: this.timeoutMs },
        ),
      );
      return data;
    } catch (error) {
      this.logger.warn(
        `Prediction service unavailable, using fallback estimate: ${this.reason(error)}`,
      );
      return fallbackQueueEstimate(request);
    }
  }

  async modelInfo(): Promise<ModelInfo | null> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<ModelInfo>(`${this.baseUrl}/model/info`, {
          headers: this.headers(),
          timeout: this.timeoutMs,
        }),
      );
      return data;
    } catch (error) {
      this.logger.warn(`Could not read model info: ${this.reason(error)}`);
      return null;
    }
  }

  /** Asks fila-viva-ai to retrain, mixing synthetic data with our history. */
  async retrain(): Promise<ModelInfo | null> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<ModelInfo>(
          `${this.baseUrl}/train`,
          {},
          { headers: this.headers(), timeout: 120_000 },
        ),
      );
      return data;
    } catch (error) {
      this.logger.warn(`Retraining failed: ${this.reason(error)}`);
      return null;
    }
  }

  private headers(): Record<string, string> {
    return { 'X-API-Key': this.apiKey };
  }

  private reason(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
