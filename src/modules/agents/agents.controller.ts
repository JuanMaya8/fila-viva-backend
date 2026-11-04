import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../common/enums/user-role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { QueueOrchestrator } from '../queue/queue-orchestrator.service';
import { QueueViewsService } from '../queue/queue-views.service';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { UpdateAgentStatusDto } from './dto/update-agent-status.dto';

@ApiTags('agents')
@ApiBearerAuth()
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly orchestrator: QueueOrchestrator,
    private readonly views: QueueViewsService,
  ) {}

  @Roles(UserRole.ADVISOR)
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const agent = await this.agentsService.findOne(this.agentId(user));
    const snapshot = await this.orchestrator.getSnapshot(agent.institutionId);
    return this.views.advisorView(agent, null, snapshot);
  }

  @Roles(UserRole.ADVISOR)
  @Patch('me/status')
  async updateMyStatus(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateAgentStatusDto,
  ) {
    const agent = await this.agentsService.updateStatus(
      this.agentId(user),
      dto,
    );
    return { id: agent.id, status: agent.status };
  }

  @Roles(UserRole.ADMIN)
  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.agentsService.findAll(user.institutionId);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAgentDto) {
    return this.agentsService.create(user.institutionId, dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agentsService.update(id, user.institutionId, dto);
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.agentsService.resetPassword(
      id,
      user.institutionId,
      dto.password,
    );
  }

  private agentId(user: AuthUser): string {
    if (!user.agentId) {
      throw new ForbiddenException('No advisor profile for this account');
    }
    return user.agentId;
  }
}
