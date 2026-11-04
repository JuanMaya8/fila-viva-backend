import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class CompleteTurnDto {
  @ApiPropertyOptional({
    description: 'Also call the next turn ("Finalizar y llamar siguiente").',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  callNext?: boolean;
}
