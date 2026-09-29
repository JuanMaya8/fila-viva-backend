import { ApiProperty } from '@nestjs/swagger';
import { TurnStatus } from '../../../common/enums/turn-status.enum';

/**
 * What the client actually sees. This is intentionally richer than the
 * Turn entity: it blends the stored ticket with the live prediction, the
 * same way the "ticket" shown in the architecture landing page works.
 */
export class TurnResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  ticketNumber: number;

  @ApiProperty({ enum: TurnStatus })
  status: TurnStatus;

  @ApiProperty()
  peopleAhead: number;

  @ApiProperty({
    description: 'Estimated wait time in minutes, from the prediction service.',
  })
  estimatedWaitMinutes: number | null;

  @ApiProperty({ description: 'Confidence of the prediction, from 0 to 100.' })
  confidence: number | null;

  @ApiProperty({
    description:
      'Wait time a classic queueing estimation would give, for comparison.',
  })
  traditionalEstimateMinutes: number | null;
}
