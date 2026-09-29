import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceType } from './entities/service-type.entity';
import { CreateServiceTypeDto } from './dto/create-service-type.dto';

@Injectable()
export class ServiceTypesService {
  constructor(
    @InjectRepository(ServiceType)
    private readonly serviceTypesRepository: Repository<ServiceType>,
  ) {}

  create(dto: CreateServiceTypeDto): Promise<ServiceType> {
    const serviceType = this.serviceTypesRepository.create(dto);
    return this.serviceTypesRepository.save(serviceType);
  }

  findAll(institutionId?: string): Promise<ServiceType[]> {
    if (institutionId) {
      return this.serviceTypesRepository.find({ where: { institutionId } });
    }
    return this.serviceTypesRepository.find();
  }

  async findOne(id: string): Promise<ServiceType> {
    const serviceType = await this.serviceTypesRepository.findOne({
      where: { id },
    });
    if (!serviceType) {
      throw new NotFoundException(`Service type ${id} not found`);
    }
    return serviceType;
  }
}
