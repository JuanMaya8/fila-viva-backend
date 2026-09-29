import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateTurnDto {
  @ApiProperty({ example: '8f14e45f-ceea-467e-999a-9a9adc9c1b8e' })
  @IsUUID()
  institutionId: string;

  @ApiProperty({ example: '2b6f8c2e-1b3a-4a3a-9d90-7d6a0f9b6a11' })
  @IsUUID()
  @IsNotEmpty()
  serviceTypeId: string;
}
