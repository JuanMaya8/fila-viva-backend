import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RealtimeIoAdapter } from './modules/realtime/realtime-io.adapter';

const REQUIRED_ENV = ['JWT_SECRET', 'INTERNAL_API_KEY'];

export async function configureApp(app: NestExpressApplication): Promise<void> {
  const config = app.get(ConfigService);
  const origins = config.get<string[]>('frontendUrls')!;

  app.set('trust proxy', config.get<number>('trustProxy'));
  app.use(
    helmet({
      // Swagger UI ships inline scripts; the API itself only serves JSON.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.enableCors({ origin: origins, credentials: true });
  const ioAdapter = new RealtimeIoAdapter(app, origins);
  await ioAdapter.connectToRedis(config.get<string>('redis.url')!);
  app.useWebSocketAdapter(ioAdapter);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    logger.error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  await configureApp(app);

  const swagger = new DocumentBuilder()
    .setTitle('Fila Viva - Backend API')
    .setDescription(
      'Core API for turns, advisors, service types and real-time queue state. ' +
        'Log in with POST /auth/login and paste accessToken in "Authorize".',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addCookieAuth('fv_token')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = app.get(ConfigService).get<number>('port')!;
  await app.listen(port);
  logger.log(`Fila Viva backend listening on port ${port} (docs at /docs)`);
}

if (require.main === module) {
  void bootstrap();
}
