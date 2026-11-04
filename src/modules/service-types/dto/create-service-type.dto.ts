import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ServiceStepDto {
  @ApiPropertyOptional({
    description: 'Existing step id, to keep it when editing.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Verificar identidad' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;
}

export class CreateServiceTypeDto {
  @ApiProperty({ example: 'Consulta rápida' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ example: 'Saldo, información y certificados simples' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ example: 'C', description: '1 to 3 uppercase letters.' })
  @Matches(/^[A-Z]{1,3}$/)
  prefix: string;

  @ApiProperty({ example: 3 })
  @IsNumber()
  @Min(0.5)
  @Max(240)
  avgServiceTimeMinutes: number;

  @ApiProperty({ type: [ServiceStepDto] })
  @ValidateNested({ each: true })
  @Type(() => ServiceStepDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  steps: ServiceStepDto[];
}
