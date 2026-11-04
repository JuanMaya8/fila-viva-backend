import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Prediction vs. reality for one completed turn. This is the feedback
 * dataset fila-viva-ai pulls (GET /internal/history) when retraining, and
 * the source of the AI-vs-traditional error shown on the admin dashboard.
 */
@Entity('prediction_logs')
@Index('idx_prediction_logs_institution', ['institutionId', 'createdAt'])
export class PredictionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'institution_id', type: 'uuid' })
  institutionId: string;

  @Column({ name: 'turn_id', type: 'uuid', unique: true })
  turnId: string;

  @Column({ name: 'service_type_id', type: 'uuid' })
  serviceTypeId: string;

  @Column({ name: 'agent_id', type: 'uuid', nullable: true })
  agentId: string | null;

  @Column({ name: 'avg_service_minutes', type: 'float' })
  avgServiceMinutes: number;

  @Column({ name: 'steps_total', type: 'int' })
  stepsTotal: number;

  @Column({ name: 'is_complex', default: false })
  isComplex: boolean;

  @Column({ name: 'predicted_wait_minutes', type: 'float', nullable: true })
  predictedWaitMinutes: number | null;

  @Column({ name: 'traditional_wait_minutes', type: 'float', nullable: true })
  traditionalWaitMinutes: number | null;

  @Column({ name: 'actual_wait_minutes', type: 'float' })
  actualWaitMinutes: number;

  @Column({ name: 'predicted_service_minutes', type: 'float', nullable: true })
  predictedServiceMinutes: number | null;

  @Column({ name: 'actual_service_minutes', type: 'float' })
  actualServiceMinutes: number;

  @Column({
    name: 'prediction_source',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  predictionSource: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
