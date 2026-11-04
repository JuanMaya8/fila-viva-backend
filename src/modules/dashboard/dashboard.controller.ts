import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../common/enums/user-role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../auth/interfaces/jwt-payload.interface';
import { PredictionService } from '../prediction/prediction.service';
import { QueueOrchestrator } from '../queue/queue-orchestrator.service';
import { QueueStateService } from '../queue/queue-state.service';
import { QueueViewsService } from '../queue/queue-views.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@ApiTags('dashboard')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly stateService: QueueStateService,
    private readonly orchestrator: QueueOrchestrator,
    private readonly views: QueueViewsService,
    private readonly gateway: RealtimeGateway,
    private readonly predictionService: PredictionService,
  ) {}

  @Get()
  async dashboard(@CurrentUser() user: AuthUser) {
    const [state, snapshot] = await Promise.all([
      this.stateService.load(user.institutionId),
      this.orchestrator.getSnapshot(user.institutionId),
    ]);
    if (!state || !snapshot) {
      throw new NotFoundException('Institution not found');
    }
    return this.views.dashboardView(state, snapshot, (id) =>
      this.gateway.isAdvisorConnected(id),
    );
  }

  @Get('model')
  async model() {
    return { model: await this.predictionService.modelInfo() };
  }

  /** Retrains fila-viva-ai with synthetic + real history, then recalculates. */
  @Post('retrain')
  @HttpCode(200)
  async retrain(@CurrentUser() user: AuthUser) {
    const model = await this.predictionService.retrain();
    if (!model) {
      throw new ServiceUnavailableException(
        'The prediction service could not retrain',
      );
    }
    await this.orchestrator.recalculate(user.institutionId);
    return { model };
  }
}
