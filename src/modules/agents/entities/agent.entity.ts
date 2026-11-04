import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AgentStatus } from '../../../common/enums/agent-status.enum';
import { Institution } from '../../institutions/entities/institution.entity';
import { ServiceType } from '../../service-types/entities/service-type.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Advisor profile ("asesor"): the login account lives in User, while this
 * entity holds what the queue needs to know: window number, availability
 * and which service types the advisor can attend. Every status change is
 * an input for the prediction service.
 */
@Entity('agents')
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ name: 'institution_id', type: 'uuid' })
  institutionId: string;

  @ManyToOne(() => Institution, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institution_id' })
  institution: Institution;

  @Column({ name: 'window_number', type: 'int' })
  windowNumber: number;

  @Column({
    type: 'enum',
    enum: AgentStatus,
    default: AgentStatus.OFFLINE,
  })
  status: AgentStatus;

  @Column({
    name: 'status_changed_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  statusChangedAt: Date;

  @Column({ default: true })
  active: boolean;

  @ManyToMany(() => ServiceType)
  @JoinTable({
    name: 'agent_service_types',
    joinColumn: { name: 'agent_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'service_type_id', referencedColumnName: 'id' },
  })
  serviceTypes: ServiceType[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
