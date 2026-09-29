import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A type of procedure offered by an institution (e.g. "general
 * consultation" in a hospital, "account opening" in a bank). Its average
 * service time is the starting point the prediction service uses before
 * it has learned anything specific from historical data.
 */
@Entity('service_types')
export class ServiceType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'institution_id' })
  institutionId: string;

  @Column()
  name: string;

  @Column({ name: 'avg_service_time_minutes', type: 'float', default: 10 })
  avgServiceTimeMinutes: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
