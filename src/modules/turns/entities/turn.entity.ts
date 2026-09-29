import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TurnStatus } from '../../../common/enums/turn-status.enum';
import { ServiceType } from '../../service-types/entities/service-type.entity';
import { Agent } from '../../agents/entities/agent.entity';

/**
 * A single ticket taken by a person. This is the entity everything else
 * in the system revolves around: every prediction is, ultimately, an
 * answer to "how long until this turn is called".
 */
@Entity('turns')
export class Turn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'institution_id' })
  institutionId: string;

  @Column({ name: 'ticket_number' })
  ticketNumber: number;

  @Column({ name: 'service_type_id' })
  serviceTypeId: string;

  @ManyToOne(() => ServiceType)
  @JoinColumn({ name: 'service_type_id' })
  serviceType: ServiceType;

  @Column({ name: 'agent_id', nullable: true })
  agentId: string | null;

  @ManyToOne(() => Agent, { nullable: true })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent | null;

  @Column({
    type: 'enum',
    enum: TurnStatus,
    default: TurnStatus.CREATED,
  })
  status: TurnStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'called_at', type: 'timestamp', nullable: true })
  calledAt: Date | null;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
