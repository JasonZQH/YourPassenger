import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

// Starts the profile HTTP service with CORS and the v1 API prefix.
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors();
  app.setGlobalPrefix('v1');
  await app.listen(Number(configService.get<string>('PROFILE_SERVICE_PORT') ?? '3102'));
}

void bootstrap();
