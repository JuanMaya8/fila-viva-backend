import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { InstitutionsService } from './institutions.service';

@ApiTags('institutions')
@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @Public()
  @Get()
  async findAll() {
    const institutions = await this.institutionsService.findAll();
    return institutions.map(({ id, code, name }) => ({ id, code, name }));
  }
}
