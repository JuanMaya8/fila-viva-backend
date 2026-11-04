import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { QueueSnapshot } from './interfaces/queue-views.interface';

/** Hot copy of each institution's latest recalculation, kept in Redis. */
@Injectable()
export class QueueSnapshotStore {
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: RedisService,
    configService: ConfigService,
  ) {
    this.ttlSeconds = configService.get<number>('redis.snapshotTtlSeconds')!;
  }

  get(institutionId: string): Promise<QueueSnapshot | null> {
    return this.redis.getJson<QueueSnapshot>(this.key(institutionId));
  }

  save(snapshot: QueueSnapshot): Promise<void> {
    return this.redis.setJson(
      this.key(snapshot.institutionId),
      snapshot,
      this.ttlSeconds,
    );
  }

  private key(institutionId: string): string {
    return `fv:queue:${institutionId}`;
  }
}
