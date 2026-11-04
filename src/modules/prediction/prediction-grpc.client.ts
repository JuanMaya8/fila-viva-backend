import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import {
  QueuePredictionRequest,
  QueuePredictionResponse,
} from './interfaces/prediction-result.interface';

const PROTO_PATH = join(process.cwd(), 'proto', 'fila_viva_prediction.proto');

type PredictQueueFn = (
  request: QueuePredictionRequest,
  metadata: grpc.Metadata,
  options: grpc.CallOptions,
  callback: (
    error: grpc.ServiceError | null,
    response: QueuePredictionResponse,
  ) => void,
) => void;

interface PredictionStub extends grpc.Client {
  PredictQueue: PredictQueueFn;
}

/**
 * gRPC transport for fila-viva-ai (PREDICTION_TRANSPORT=grpc).
 *
 * proto-loader with keepCase=false maps snake_case proto fields to the
 * camelCase interfaces used everywhere else, so both transports return the
 * exact same QueuePredictionResponse. The channel is plaintext: use it only
 * inside a private network (docker compose, VPC).
 */
@Injectable()
export class PredictionGrpcClient implements OnModuleDestroy {
  private readonly logger = new Logger(PredictionGrpcClient.name);
  private readonly stub: PredictionStub | null = null;
  private readonly apiKey: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<string>('internalApiKey') ?? '';
    if (configService.get<string>('predictionService.transport') !== 'grpc') {
      return;
    }
    const definition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: false,
      longs: Number,
      enums: String,
      defaults: true,
      arrays: true,
    });
    const loaded = grpc.loadPackageDefinition(definition) as unknown as {
      filaviva: {
        prediction: {
          v1: {
            PredictionService: new (
              address: string,
              credentials: grpc.ChannelCredentials,
            ) => PredictionStub;
          };
        };
      };
    };
    const address = configService.get<string>('predictionService.grpcUrl')!;
    this.stub = new loaded.filaviva.prediction.v1.PredictionService(
      address,
      grpc.credentials.createInsecure(),
    );
    this.logger.log(`Using gRPC transport to ${address}`);
  }

  get enabled(): boolean {
    return this.stub !== null;
  }

  predictQueue(
    request: QueuePredictionRequest,
    timeoutMs: number,
  ): Promise<QueuePredictionResponse> {
    const metadata = new grpc.Metadata();
    metadata.set('x-api-key', this.apiKey);
    return new Promise((resolve, reject) => {
      this.stub!.PredictQueue(
        request,
        metadata,
        { deadline: Date.now() + timeoutMs },
        (error, response) => (error ? reject(error) : resolve(response)),
      );
    });
  }

  onModuleDestroy(): void {
    this.stub?.close();
  }
}
