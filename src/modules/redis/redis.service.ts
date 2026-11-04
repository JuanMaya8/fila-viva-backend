import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Optional Redis connection used as the hot store for queue snapshots.
 *
 * Every call degrades gracefully: when REDIS_URL is empty or Redis is down,
 * reads return null and writes are skipped, and callers rebuild the
 * snapshot from PostgreSQL (the source of truth).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | null;
  private lastErrorLoggedAt = 0;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    this.client = url
      ? new Redis(url, {
          lazyConnect: false,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          retryStrategy: (attempt) => Math.min(attempt * 500, 10_000),
        })
      : null;
    this.client?.on('error', (error: Error) => this.logThrottled(error));
    if (!this.client) {
      this.logger.log(
        'REDIS_URL not set: snapshots are rebuilt from PostgreSQL',
      );
    }
  }

  get enabled(): boolean {
    return this.client?.status === 'ready';
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.enabled) {
      return null;
    }
    try {
      const raw = await this.client!.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.logThrottled(error);
      return null;
    }
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      await this.client!.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logThrottled(error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  private logThrottled(error: unknown): void {
    const now = Date.now();
    if (now - this.lastErrorLoggedAt > 60_000) {
      this.lastErrorLoggedAt = now;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Redis unavailable, degrading to PostgreSQL: ${message}`,
      );
    }
  }
}
