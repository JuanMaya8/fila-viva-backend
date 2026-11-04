import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateProgressDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Ids of completed steps.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsUUID('all', { each: true })
  completedStepIds?: string[];

  @ApiPropertyOptional({ example: 'Cliente trae documentos incompletos' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Flags the attention as a complex case.',
  })
  @IsOptional()
  @IsBoolean()
  isComplex?: boolean;
}
