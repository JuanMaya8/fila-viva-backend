import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import configuration from '../../config/configuration';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ADVISOR_LOGGED_OUT } from '../../common/events/queue-events';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { AuthUser } from './interfaces/jwt-payload.interface';

const { rateLimit } = configuration();

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Sets the session as an httpOnly cookie. The token is also returned so
   * it can be pasted into Swagger's "Authorize" dialog; the web app never
   * stores it.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: rateLimit.loginPerMinute, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.authService.login(
      dto.email,
      dto.password,
    );
    res.cookie(
      this.authService.sessionCookieName,
      token,
      this.authService.cookieOptions(),
    );
    return { user, accessToken: token };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.authService.extractToken(
      req.headers.authorization,
      req.headers.cookie,
    );
    if (token) {
      const authUser = await this.authService
        .verify(token, 'access')
        .catch(() => null);
      if (authUser?.agentId) {
        await this.eventEmitter.emitAsync(ADVISOR_LOGGED_OUT, {
          agentId: authUser.agentId,
        });
      }
    }
    const options = this.authService.cookieOptions();
    delete options.maxAge;
    res.clearCookie(this.authService.sessionCookieName, options);
    return { ok: true };
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user);
  }

  @ApiBearerAuth()
  @Post('socket-token')
  @HttpCode(200)
  async socketToken(@CurrentUser() user: AuthUser) {
    return { token: await this.authService.issueSocketToken(user) };
  }
}
