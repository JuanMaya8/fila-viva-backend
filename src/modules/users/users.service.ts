import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { EntityManager, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { PASSWORD_HASH_ROUNDS } from '../../common/utils/password';
import { User } from './entities/user.entity';

export interface CreateUserInput {
  institutionId: string;
  email: string;
  fullName: string;
  password: string;
  role: UserRole;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Includes the password hash, which is excluded from every other read. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', {
        email: UsersService.normalizeEmail(email),
      })
      .getOne();
  }

  async findOneOrFail(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async create(input: CreateUserInput, manager?: EntityManager): Promise<User> {
    const repository = manager
      ? manager.getRepository(User)
      : this.usersRepository;
    const email = UsersService.normalizeEmail(input.email);
    if (await repository.exist({ where: { email } })) {
      throw new ConflictException(`A user with email ${email} already exists`);
    }
    const user = repository.create({
      institutionId: input.institutionId,
      email,
      fullName: input.fullName,
      role: input.role,
      passwordHash: await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS),
    });
    return repository.save(user);
  }

  async update(
    id: string,
    changes: Partial<Pick<User, 'email' | 'fullName' | 'active'>>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager
      ? manager.getRepository(User)
      : this.usersRepository;
    if (changes.email) {
      changes.email = UsersService.normalizeEmail(changes.email);
      const owner = await repository.findOne({
        where: { email: changes.email },
      });
      if (owner && owner.id !== id) {
        throw new ConflictException(
          `A user with email ${changes.email} already exists`,
        );
      }
    }
    await repository.update(id, changes);
  }

  async setPassword(id: string, password: string): Promise<void> {
    await this.findOneOrFail(id);
    await this.usersRepository.update(id, {
      passwordHash: await bcrypt.hash(password, PASSWORD_HASH_ROUNDS),
    });
  }

  verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
