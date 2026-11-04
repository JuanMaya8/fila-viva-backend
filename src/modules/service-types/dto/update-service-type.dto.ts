import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateServiceTypeDto } from './create-service-type.dto';

export class UpdateServiceTypeDto extends PartialType(CreateServiceTypeDto) {
  @ApiPropertyOptional({ description: 'false hides it from new turns.' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
