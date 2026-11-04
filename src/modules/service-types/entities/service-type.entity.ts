import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Institution } from '../../institutions/entities/institution.entity';
import { ServiceStep } from './service-step.entity';

/**
 * A type of procedure offered by an institution (e.g. "account opening"
 * in a bank). Its average service time is the prior the prediction
 * service starts from before it learns from historical data.
 */
@Entity('service_types')
export class ServiceType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'institution_id', type: 'uuid' })
  institutionId: string;

  @ManyToOne(() => Institution, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institution_id' })
  institution: Institution;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  description: string;

  /** Letter shown before the ticket number, e.g. "C" in "C-012". */
  @Column({ type: 'varchar', length: 3 })
  prefix: string;

  @Column({ name: 'avg_service_time_minutes', type: 'float', default: 10 })
  avgServiceTimeMinutes: number;

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => ServiceStep, (step) => step.serviceType, {
    cascade: true,
  })
  steps: ServiceStep[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
