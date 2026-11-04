import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthService } from '../auth.service';

/**
 * Global guard: every route requires a valid access token (httpOnly
 * cookie or "Authorization: Bearer" header) unless marked with @Public().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.authService.extractToken(
      request.headers.authorization,
      request.headers.cookie,
    );
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }
    (request as Request & { user: unknown }).user =
      await this.authService.verify(token, 'access');
    return true;
  }
}
