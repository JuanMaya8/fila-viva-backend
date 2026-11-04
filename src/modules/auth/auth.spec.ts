import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthService } from './auth.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import { RolesGuard } from './guards/roles.guard';

const config = (values: Record<string, unknown>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const http = (request: object, handlerRoles?: UserRole[]) => {
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  };
  const reflector = {
    getAllAndOverride: () => handlerRoles,
  } as unknown as Reflector;
  return { context: context as never, reflector };
};

describe('AuthService', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  let users: Record<string, jest.Mock>;
  let agents: { findOne: jest.Mock };
  let service: AuthService;

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    const admin = {
      id: 'u1',
      email: 'admin@bancodemo.test',
      fullName: 'Admin',
      role: UserRole.ADMIN,
      institutionId: 'i1',
      active: true,
      passwordHash,
    };
    users = {
      findByEmailWithPassword: jest.fn().mockResolvedValue(admin),
      findOneOrFail: jest.fn().mockResolvedValue(admin),
      verifyPassword: jest.fn((plain: string, hash: string) =>
        bcrypt.compare(plain, hash),
      ),
    };
    agents = { findOne: jest.fn() };
    service = new AuthService(
      users as never,
      jwt,
      config({
        'auth.cookieName': 'fv_token',
        'auth.socketTokenExpiresInSeconds': 300,
        'auth.jwtExpiresInSeconds': 3600,
      }),
      agents as never,
    );
  });

  it('logs in with valid credentials and never returns the hash', async () => {
    const { token, user } = await service.login(
      'admin@bancodemo.test',
      'correct-password',
    );
    expect(token).toBeTruthy();
    expect(user).not.toHaveProperty('passwordHash');
    expect(user.role).toBe(UserRole.ADMIN);
  });

  it('rejects a wrong password', async () => {
    await expect(
      service.login('admin@bancodemo.test', 'wrong'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects disabled accounts', async () => {
    users.findByEmailWithPassword.mockResolvedValueOnce({
      ...(await users.findByEmailWithPassword()),
      active: false,
    });
    await expect(
      service.login('admin@bancodemo.test', 'correct-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not accept a socket token as an access token', async () => {
    const { token } = await service.login(
      'admin@bancodemo.test',
      'correct-password',
    );
    const user = await service.verify(token, 'access');
    const socketToken = await service.issueSocketToken(user);
    await expect(service.verify(socketToken, 'access')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.verify(socketToken, 'socket')).resolves.toMatchObject({
      userId: 'u1',
      role: UserRole.ADMIN,
    });
  });

  it('reads the token from the bearer header or the session cookie', () => {
    expect(service.extractToken('Bearer abc', undefined)).toBe('abc');
    expect(service.extractToken(undefined, 'x=1; fv_token=xyz')).toBe('xyz');
    expect(service.extractToken(undefined, undefined)).toBeNull();
  });
});

describe('RolesGuard', () => {
  it('allows routes without roles', () => {
    const { context, reflector } = http({ user: undefined }, undefined);
    expect(new RolesGuard(reflector).canActivate(context)).toBe(true);
  });

  it('allows the right role and forbids the others', () => {
    const allowed = http({ user: { role: UserRole.ADMIN } }, [UserRole.ADMIN]);
    expect(new RolesGuard(allowed.reflector).canActivate(allowed.context)).toBe(
      true,
    );
    const denied = http({ user: { role: UserRole.ADVISOR } }, [UserRole.ADMIN]);
    expect(() =>
      new RolesGuard(denied.reflector).canActivate(denied.context),
    ).toThrow(ForbiddenException);
  });
});

describe('ApiKeyGuard', () => {
  const guard = new ApiKeyGuard(config({ internalApiKey: 'secret-key' }));

  it('accepts the configured key', () => {
    const { context } = http({ headers: { 'x-api-key': 'secret-key' } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it.each([undefined, 'wrong', 'secret-key-longer'])('rejects %s', (key) => {
    const { context } = http({ headers: { 'x-api-key': key } });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
