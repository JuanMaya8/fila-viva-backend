import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAgentDto {
  @ApiProperty({ example: 'María Fernández' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  fullName: string;

  @ApiProperty({ example: 'maria@bancodemo.test' })
  @IsEmail()
  @MaxLength(120)
  email: string;

  @ApiProperty({ example: 'initial-password', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(99)
  windowNumber: number;

  @ApiProperty({
    type: [String],
    description: 'Service types this advisor attends.',
  })
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  serviceTypeIds: string[];
}
