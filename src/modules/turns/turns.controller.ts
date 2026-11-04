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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import configuration from '../../config/configuration';
import { UserRole } from '../../common/enums/user-role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { CompleteTurnDto } from './dto/complete-turn.dto';
import { CreateTurnDto } from './dto/create-turn.dto';
import { TurnResponseDto } from './dto/turn-response.dto';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { TurnsService } from './turns.service';

const { rateLimit } = configuration();

@ApiTags('turns')
@Controller('turns')
export class TurnsController {
  constructor(private readonly turnsService: TurnsService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: rateLimit.turnsPerMinute, ttl: 60_000 } })
  @ApiOkResponse({ type: TurnResponseDto })
  @Post()
  create(@Body() dto: CreateTurnDto) {
    return this.turnsService.create(dto);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.ADVISOR)
  @ApiOkResponse({ type: [TurnResponseDto] })
  @Get()
  findQueue(
    @CurrentUser() user: AuthUser,
    @Query('serviceTypeId', new ParseUUIDPipe()) serviceTypeId: string,
  ) {
    return this.turnsService.findQueue(user.institutionId, serviceTypeId);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADVISOR)
  @Post('call-next')
  @HttpCode(200)
  async callNext(@CurrentUser() user: AuthUser) {
    return { turn: await this.turnsService.callNext(this.agentId(user)) };
  }

  @Public()
  @ApiOkResponse({ type: TurnResponseDto })
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.turnsService.findView(id);
  }

  @Public()
  @ApiOkResponse({ type: TurnResponseDto })
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.turnsService.cancel(id);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADVISOR)
  @Post(':id/start')
  @HttpCode(200)
  start(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.turnsService.start(id, this.agentId(user));
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADVISOR)
  @Patch(':id/progress')
  updateProgress(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.turnsService.updateProgress(id, this.agentId(user), dto);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADVISOR)
  @Post(':id/absent')
  @HttpCode(200)
  absent(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.turnsService.markAbsent(id, this.agentId(user));
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADVISOR)
  @Post(':id/complete')
  @HttpCode(200)
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CompleteTurnDto,
  ) {
    return this.turnsService.complete(
      id,
      this.agentId(user),
      dto.callNext ?? false,
    );
  }

  private agentId(user: AuthUser): string {
    if (!user.agentId) {
      throw new ForbiddenException('No advisor profile for this account');
    }
    return user.agentId;
  }
}
