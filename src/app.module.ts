import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { buildDataSourceOptions } from './database/data-source';
import { AgentsModule } from './modules/agents/agents.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DisplayModule } from './modules/display/display.module';
import { HealthController } from './modules/health/health.controller';
import { InstitutionsModule } from './modules/institutions/institutions.module';
import { InternalModule } from './modules/internal/internal.module';
import { PredictionModule } from './modules/prediction/prediction.module';
import { QueueModule } from './modules/queue/queue.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RedisModule } from './modules/redis/redis.module';
import { ServiceTypesModule } from './modules/service-types/service-types.module';
import { TurnsModule } from './modules/turns/turns.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...buildDataSourceOptions(),
        migrationsRun: true,
      }),
    }),
    // Wildcards let QueueOrchestrator subscribe to 'queue.**'.
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    RedisModule,
    InstitutionsModule,
    AuthModule,
    RealtimeModule,
    PredictionModule,
    QueueModule,
    AgentsModule,
    ServiceTypesModule,
    TurnsModule,
    DashboardModule,
    DisplayModule,
    InternalModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
