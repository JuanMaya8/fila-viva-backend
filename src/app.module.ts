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
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        autoLoadEntities: true,
        // synchronize is convenient for the first weeks of the project;
        // replace it with TypeORM migrations before going to production.
        synchronize: config.get<string>('nodeEnv') !== 'production',
      }),
    }),
    AgentsModule,
    ServiceTypesModule,
    TurnsModule,
    PredictionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
