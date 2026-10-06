import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { HealthController } from './modules/health/health.controller';
import { AgentsModule } from './modules/agents/agents.module';
import { ServiceTypesModule } from './modules/service-types/service-types.module';
import { TurnsModule } from './modules/turns/turns.module';
import { PredictionModule } from './modules/prediction/prediction.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('database.url');

        return {
          type: 'postgres',
          ...(databaseUrl
            ? {
                url: databaseUrl,
                ssl: { rejectUnauthorized: true },
              }
            : {
                host: config.get<string>('database.host'),
                port: config.get<number>('database.port'),
                username: config.get<string>('database.username'),
                password: config.get<string>('database.password'),
                database: config.get<string>('database.name'),
              }),
          autoLoadEntities: true,
          // Use DB_SYNCHRONIZE only for the demo bootstrap; production needs migrations.
          synchronize:
            config.get<boolean>('database.synchronize') ??
            config.get<string>('nodeEnv') !== 'production',
        };
      },
    }),
    AgentsModule,
    ServiceTypesModule,
    TurnsModule,
    PredictionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
