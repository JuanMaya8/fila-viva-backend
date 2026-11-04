import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateAgentDto } from './create-agent.dto';

export class UpdateAgentDto extends PartialType(
  OmitType(CreateAgentDto, ['password'] as const),
) {
  @ApiPropertyOptional({
    description: 'false deactivates the advisor and blocks login.',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
