import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { CookieOptions } from 'express';
import { Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { parseCookieHeader } from '../../common/utils/cookies';
import { Agent } from '../agents/entities/agent.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  AuthUser,
  JwtPayload,
  TokenKind,
} from './interfaces/jwt-payload.interface';

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  institutionId: string;
  agentId: string | null;
}

@Injectable()
export class AuthService {
  private readonly cookieName: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(Agent)
    private readonly agentsRepository: Repository<Agent>,
  ) {
    this.cookieName = this.configService.get<string>('auth.cookieName')!;
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ token: string; user: SessionUser }> {
    const user = await this.usersService.findByEmailWithPassword(email);
    const valid =
      user &&
      user.active &&
      (await this.usersService.verifyPassword(password, user.passwordHash));
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const agentId = await this.resolveAgentId(user);
    const token = await this.sign(user, agentId, 'access');
    return { token, user: this.toSessionUser(user, agentId) };
  }

  /** Short-lived token the browser passes to Socket.io (it cannot read the httpOnly cookie). */
  issueSocketToken(authUser: AuthUser): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: authUser.userId,
        role: authUser.role,
        institutionId: authUser.institutionId,
        agentId: authUser.agentId,
        kind: 'socket',
      } satisfies JwtPayload,
      {
        expiresIn: this.configService.get<number>(
          'auth.socketTokenExpiresInSeconds',
        ),
      },
    );
  }

  /** Verifies signature, expiry, token kind and that the account is still active. */
  async verify(token: string, kind: TokenKind): Promise<AuthUser> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
    if (payload.kind !== kind) {
      throw new UnauthorizedException('Invalid token type');
    }
    const user = await this.usersService
      .findOneOrFail(payload.sub)
      .catch(() => null);
    if (!user || !user.active) {
      throw new UnauthorizedException('Account disabled');
    }
    if (user.role === UserRole.ADVISOR) {
      const agent = payload.agentId
        ? await this.agentsRepository.findOne({
            where: { id: payload.agentId },
          })
        : null;
      if (!agent || !agent.active) {
        throw new UnauthorizedException('Advisor profile disabled');
      }
    }
    return {
      userId: user.id,
      role: user.role,
      institutionId: user.institutionId,
      agentId: payload.agentId,
    };
  }

  async me(authUser: AuthUser): Promise<SessionUser> {
    const user = await this.usersService.findOneOrFail(authUser.userId);
    return this.toSessionUser(user, authUser.agentId);
  }

  extractToken(
    authorizationHeader: string | undefined,
    cookieHeader: string | undefined,
  ): string | null {
    if (authorizationHeader?.startsWith('Bearer ')) {
      return authorizationHeader.slice('Bearer '.length).trim() || null;
    }
    return parseCookieHeader(cookieHeader)[this.cookieName] ?? null;
  }

  get sessionCookieName(): string {
    return this.cookieName;
  }

  cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.configService.get<boolean>('auth.cookieSecure'),
      path: '/',
      maxAge:
        this.configService.get<number>('auth.jwtExpiresInSeconds')! * 1000,
    };
  }

  private async resolveAgentId(user: User): Promise<string | null> {
    if (user.role !== UserRole.ADVISOR) {
      return null;
    }
    const agent = await this.agentsRepository.findOne({
      where: { userId: user.id },
    });
    if (!agent || !agent.active) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return agent.id;
  }

  private sign(
    user: User,
    agentId: string | null,
    kind: TokenKind,
  ): Promise<string> {
    return this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
      institutionId: user.institutionId,
      agentId,
      kind,
    } satisfies JwtPayload);
  }

  private toSessionUser(user: User, agentId: string | null): SessionUser {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      institutionId: user.institutionId,
      agentId,
    };
  }
}
