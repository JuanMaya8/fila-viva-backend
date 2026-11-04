import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators/public.decorator';
import { RedisService } from '../redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async check() {
    const database = await this.dataSource
      .query('SELECT 1')
      .then(() => 'up')
      .catch(() => 'down');
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'fila-viva-backend',
      database,
      redis: this.redis.enabled ? 'up' : 'disabled-or-down',
      timestamp: new Date().toISOString(),
    };
  }
}
