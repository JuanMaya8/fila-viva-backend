import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, ServerOptions } from 'socket.io';

/**
 * Socket.io adapter with the same CORS allow-list as HTTP and, when
 * REDIS_URL is set, the Redis pub/sub adapter: every emit is published to
 * Redis and fanned out by every backend instance to its own sockets, so the
 * API can scale horizontally without sticky rooms. Without Redis it runs
 * single-node with the in-memory adapter.
 */
export class RealtimeIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RealtimeIoAdapter.name);
  private adapterFactory: ReturnType<typeof createAdapter> | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;

  constructor(
    app: INestApplicationContext,
    private readonly allowedOrigins: string[],
  ) {
    super(app);
  }

  async connectToRedis(url: string): Promise<void> {
    if (!url) {
      return;
    }
    const pub = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    const sub = pub.duplicate();
    // Errors are reported once by the connect attempt below.
    pub.on('error', () => undefined);
    sub.on('error', () => undefined);
    try {
      await Promise.all([pub.connect(), sub.connect()]);
      this.pubClient = pub;
      this.subClient = sub;
      this.adapterFactory = createAdapter(pub, sub, { key: 'fv:socket.io' });
      this.logger.log(
        'Socket.io Redis adapter enabled (multi-instance fan-out)',
      );
    } catch (error) {
      pub.disconnect();
      sub.disconnect();
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Redis adapter unavailable, running single-node: ${message}`,
      );
    }
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.allowedOrigins, credentials: true },
    });
    if (this.adapterFactory) {
      server.adapter(this.adapterFactory);
    }
    return server;
  }

  async close(server: Server): Promise<void> {
    await super.close(server);
    await Promise.all(
      [this.pubClient, this.subClient].map((client) =>
        client?.quit().catch(() => client.disconnect()),
      ),
    );
    this.pubClient = null;
    this.subClient = null;
  }
}
