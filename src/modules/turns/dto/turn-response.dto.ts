import { ApiProperty } from '@nestjs/swagger';
import { TurnStatus } from '../../../common/enums/turn-status.enum';
import {
  CongestionLevel,
  PredictionSource,
} from '../../prediction/interfaces/prediction-result.interface';
import { TurnView } from '../../queue/interfaces/queue-views.interface';

/**
 * What the person sees on their live ticket. It blends the stored ticket
 * with the latest prediction from the queue snapshot. Mirrored by
 * TurnResponse in fila-viva-frontend (src/lib/types.ts).
 */
export class TurnResponseDto implements TurnView {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 12 })
  ticketNumber: number;

  @ApiProperty({ example: 'C-012' })
  ticketCode: string;

  @ApiProperty({ enum: TurnStatus })
  status: TurnStatus;

  @ApiProperty()
  serviceTypeId: string;

  @ApiProperty({ example: 'Consulta rápida' })
  serviceTypeName: string;

  @ApiProperty()
  preferential: boolean;

  @ApiProperty({
    description: 'Turns of the same service type called before this one.',
  })
  peopleAhead: number;

  @ApiProperty({ nullable: true, description: 'AI estimate in minutes.' })
  estimatedWaitMinutes: number | null;

  @ApiProperty({ nullable: true, description: 'p10 of the estimate.' })
  lowerMinutes: number | null;

  @ApiProperty({ nullable: true, description: 'p90 of the estimate.' })
  upperMinutes: number | null;

  @ApiProperty({ nullable: true, description: '0 to 100.' })
  confidence: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Position x fixed average, for comparison.',
  })
  traditionalEstimateMinutes: number | null;

  @ApiProperty({ nullable: true, enum: ['low', 'medium', 'high'] })
  congestionLevel: CongestionLevel | null;

  @ApiProperty({ nullable: true, enum: ['model', 'baseline', 'fallback'] })
  source: PredictionSource | null;

  @ApiProperty({ nullable: true, description: 'Window to go to once called.' })
  windowNumber: number | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ nullable: true })
  calledAt: string | null;

  @ApiProperty()
  estimatedAt: string;
}
