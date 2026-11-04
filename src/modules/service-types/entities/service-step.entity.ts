import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ServiceType } from './service-type.entity';

/** One checklist step the advisor ticks while attending a service type. */
@Entity('service_steps')
export class ServiceStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'service_type_id', type: 'uuid' })
  serviceTypeId: string;

  @ManyToOne(() => ServiceType, (serviceType) => serviceType.steps, {
    onDelete: 'CASCADE',
    orphanedRowAction: 'delete',
  })
  @JoinColumn({ name: 'service_type_id' })
  serviceType: ServiceType;

  @Column({ type: 'int' })
  position: number;

  @Column()
  name: string;
}
