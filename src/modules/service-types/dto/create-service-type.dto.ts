import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateServiceTypeDto {
  @ApiProperty({ example: '8f14e45f-ceea-467e-999a-9a9adc9c1b8e' })
  @IsUUID()
  institutionId: string;

  @ApiProperty({ example: 'General consultation' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 10.8, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  avgServiceTimeMinutes?: number;
}
