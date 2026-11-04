import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

export const API_KEY_HEADER = 'x-api-key';

/** Service-to-service guard (fila-viva-ai -> backend) using INTERNAL_API_KEY. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('internalApiKey') ?? '';
    const received = context.switchToHttp().getRequest().headers[
      API_KEY_HEADER
    ];
    if (!expected || typeof received !== 'string') {
      throw new UnauthorizedException('Invalid API key');
    }
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid API key');
    }
    return true;
  }
}
