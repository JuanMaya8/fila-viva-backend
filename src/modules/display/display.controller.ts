import {
  Controller,
  Get,
  NotFoundException,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { QueueOrchestrator } from '../queue/queue-orchestrator.service';
import { QueueStateService } from '../queue/queue-state.service';
import { QueueViewsService } from '../queue/queue-views.service';

/** Public waiting-room screen: ticket codes and windows only, no personal data. */
@ApiTags('display')
@Controller('display')
export class DisplayController {
  constructor(
    private readonly stateService: QueueStateService,
    private readonly orchestrator: QueueOrchestrator,
    private readonly views: QueueViewsService,
  ) {}

  @Public()
  @ApiQuery({ name: 'institutionId', required: true })
  @Get()
  async display(
    @Query('institutionId', new ParseUUIDPipe()) institutionId: string,
  ) {
    const [state, snapshot] = await Promise.all([
      this.stateService.load(institutionId),
      this.orchestrator.getSnapshot(institutionId),
    ]);
    if (!state || !snapshot) {
      throw new NotFoundException(`Institution ${institutionId} not found`);
    }
    return this.views.displayView(state, snapshot);
  }
}
