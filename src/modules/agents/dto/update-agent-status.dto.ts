import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { AgentStatus } from '../../../common/enums/agent-status.enum';

export class UpdateAgentStatusDto {
  @ApiProperty({ enum: AgentStatus, example: AgentStatus.AVAILABLE })
  @IsEnum(AgentStatus)
  status: AgentStatus;
}
