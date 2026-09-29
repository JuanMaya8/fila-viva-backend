import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateAgentDto {
  @ApiProperty({ example: 'Maria Fernandez' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: '8f14e45f-ceea-467e-999a-9a9adc9c1b8e' })
  @IsUUID()
  institutionId: string;
}
