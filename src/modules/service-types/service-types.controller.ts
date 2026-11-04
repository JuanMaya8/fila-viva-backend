import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../common/enums/user-role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { InstitutionsService } from '../institutions/institutions.service';
import { QueueOrchestrator } from '../queue/queue-orchestrator.service';
import { CreateServiceTypeDto } from './dto/create-service-type.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';
import { ServiceTypesService } from './service-types.service';

@ApiTags('service-types')
@Controller('service-types')
export class ServiceTypesController {
  constructor(
    private readonly serviceTypesService: ServiceTypesService,
    private readonly institutionsService: InstitutionsService,
    private readonly orchestrator: QueueOrchestrator,
  ) {}

  /** Public catalogue shown before taking a turn, with the live estimated wait. */
  @Public()
  @ApiQuery({ name: 'institutionId', required: true })
  @Get()
  async findPublic(
    @Query('institutionId', new ParseUUIDPipe()) institutionId: string,
  ) {
    await this.institutionsService.findOneOrFail(institutionId);
    const [types, snapshot] = await Promise.all([
      this.serviceTypesService.findAll(institutionId, true),
      this.orchestrator.getSnapshot(institutionId),
    ]);
    return types.map((type) => {
      const queue = snapshot?.queues[type.id];
      return {
        id: type.id,
        name: type.name,
        description: type.description,
        prefix: type.prefix,
        avgServiceTimeMinutes: type.avgServiceTimeMinutes,
        stepsCount: type.steps.length,
        waiting: queue?.waiting ?? 0,
        activeAdvisors: queue?.activeAdvisors ?? 0,
        estimatedWaitMinutes: queue?.estimatedWaitMinutes ?? null,
        confidence: queue?.confidence ?? null,
        congestionLevel: queue?.congestionLevel ?? null,
      };
    });
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Get('manage')
  findAllForAdmin(@CurrentUser() user: AuthUser) {
    return this.serviceTypesService.findAll(user.institutionId, false);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateServiceTypeDto) {
    return this.serviceTypesService.create(user.institutionId, dto);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateServiceTypeDto,
  ) {
    return this.serviceTypesService.update(id, user.institutionId, dto);
  }
}
