import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

// Starts the session HTTP service with CORS and the v1 API prefix.
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors();
  app.setGlobalPrefix('v1');
  await app.listen(Number(configService.get<string>('SESSION_SERVICE_PORT') ?? '3103'));
}

void bootstrap();
