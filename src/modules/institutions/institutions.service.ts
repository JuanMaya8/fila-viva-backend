import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Institution } from './entities/institution.entity';

@Injectable()
export class InstitutionsService {
  constructor(
    @InjectRepository(Institution)
    private readonly institutionsRepository: Repository<Institution>,
  ) {}

  findAll(): Promise<Institution[]> {
    return this.institutionsRepository.find({ order: { name: 'ASC' } });
  }

  /** Throws 404 when the institution does not exist. */
  async findOneOrFail(id: string): Promise<Institution> {
    const institution = await this.institutionsRepository.findOne({
      where: { id },
    });
    if (!institution) {
      throw new NotFoundException(`Institution ${id} not found`);
    }
    return institution;
  }
}
