import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { AgentStatus } from '../../../common/enums/agent-status.enum';

/** Statuses an advisor can choose; BUSY is set by the turn lifecycle. */
export const SELECTABLE_AGENT_STATUSES = [
  AgentStatus.AVAILABLE,
  AgentStatus.ON_BREAK,
] as const;

export class UpdateAgentStatusDto {
  @ApiProperty({
    enum: SELECTABLE_AGENT_STATUSES,
    example: AgentStatus.AVAILABLE,
  })
  @IsIn(SELECTABLE_AGENT_STATUSES)
  status: (typeof SELECTABLE_AGENT_STATUSES)[number];
}
