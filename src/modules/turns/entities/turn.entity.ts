import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TurnStatus } from '../../../common/enums/turn-status.enum';
import { ServiceType } from '../../service-types/entities/service-type.entity';
import { Agent } from '../../agents/entities/agent.entity';
import { Institution } from '../../institutions/entities/institution.entity';

/**
 * A single ticket taken by a person. Every prediction is, ultimately, an
 * answer to "how long until this turn is called". The prediction made at
 * creation time is stored to compare it with reality once completed.
 */
@Entity('turns')
@Index('idx_turns_queue', ['institutionId', 'status', 'createdAt'])
export class Turn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'institution_id', type: 'uuid' })
  institutionId: string;

  @ManyToOne(() => Institution, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institution_id' })
  institution: Institution;

  @Column({ name: 'ticket_number', type: 'int' })
  ticketNumber: number;

  @Column({ name: 'ticket_code', type: 'varchar', length: 12 })
  ticketCode: string;

  @Column({ name: 'service_type_id', type: 'uuid' })
  serviceTypeId: string;

  @ManyToOne(() => ServiceType)
  @JoinColumn({ name: 'service_type_id' })
  serviceType: ServiceType;

  @Column({ default: false })
  preferential: boolean;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId: string | null;

  @ManyToOne(() => Agent, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'agent_id' })
  agent: Agent | null;

  @Column({
    type: 'enum',
    enum: TurnStatus,
    default: TurnStatus.CREATED,
  })
  status: TurnStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'called_at', type: 'timestamptz', nullable: true })
  calledAt: Date | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** When the turn left the queue without being served (absent/cancelled). */
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'predicted_wait_minutes', type: 'float', nullable: true })
  predictedWaitMinutes: number | null;

  @Column({
    name: 'predicted_traditional_minutes',
    type: 'float',
    nullable: true,
  })
  predictedTraditionalMinutes: number | null;

  @Column({ name: 'predicted_confidence', type: 'int', nullable: true })
  predictedConfidence: number | null;

  @Column({ name: 'predicted_service_minutes', type: 'float', nullable: true })
  predictedServiceMinutes: number | null;

  @Column({
    name: 'prediction_source',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  predictionSource: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
