import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstitutionsModule } from '../institutions/institutions.module';
import { QueueModule } from '../queue/queue.module';
import { ServiceType } from './entities/service-type.entity';
import { ServiceStep } from './entities/service-step.entity';
import { ServiceTypesService } from './service-types.service';
import { ServiceTypesController } from './service-types.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceType, ServiceStep]),
    InstitutionsModule,
    QueueModule,
  ],
  controllers: [ServiceTypesController],
  providers: [ServiceTypesService],
  exports: [ServiceTypesService],
})
export class ServiceTypesModule {}
