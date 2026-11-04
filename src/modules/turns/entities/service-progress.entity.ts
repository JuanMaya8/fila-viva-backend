import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Turn } from './turn.entity';

/** What the advisor has recorded while attending a turn. */
@Entity('service_progress')
export class ServiceProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'turn_id', type: 'uuid', unique: true })
  turnId: string;

  @OneToOne(() => Turn, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'turn_id' })
  turn: Turn;

  @Column({
    name: 'completed_step_ids',
    type: 'uuid',
    array: true,
    default: () => "'{}'",
  })
  completedStepIds: string[];

  @Column({ type: 'text', default: '' })
  notes: string;

  @Column({ name: 'is_complex', default: false })
  isComplex: boolean;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
