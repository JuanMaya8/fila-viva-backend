import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { PredictionLogsService } from '../prediction-logs/prediction-logs.service';

const MAX_HISTORY = 20_000;

/**
 * Service-to-service endpoints for fila-viva-ai, protected with
 * INTERNAL_API_KEY (header X-API-Key) instead of user sessions.
 */
@ApiTags('internal')
@ApiHeader({ name: 'X-API-Key', required: true })
@Public()
@UseGuards(ApiKeyGuard)
@Controller('internal')
export class InternalController {
  constructor(private readonly predictionLogs: PredictionLogsService) {}

  /** Completed attentions (prediction vs. reality) used for retraining. */
  @ApiQuery({ name: 'since', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'limit', required: false })
  @Get('history')
  async history(
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    const sinceDate = since ? new Date(since) : null;
    if (sinceDate && Number.isNaN(sinceDate.getTime())) {
      throw new BadRequestException('since must be an ISO date');
    }
    const take = Math.min(
      MAX_HISTORY,
      Math.max(1, Number(limit) || MAX_HISTORY),
    );
    const records = await this.predictionLogs.history(sinceDate, take);
    return { count: records.length, records };
  }
}
