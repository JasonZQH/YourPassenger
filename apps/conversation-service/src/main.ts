import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import {
  CONVERSATION_HOT_PATH_PACKAGE,
  CONVERSATION_HOT_PATH_PROTO_PATH,
} from '@yourpassenger/contracts';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors();
  app.setGlobalPrefix('v1');
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: CONVERSATION_HOT_PATH_PACKAGE,
      protoPath: CONVERSATION_HOT_PATH_PROTO_PATH,
      url:
        configService.get<string>('CONVERSATION_SERVICE_GRPC_URL') ??
        `0.0.0.0:${configService.get<string>('CONVERSATION_SERVICE_GRPC_PORT') ?? '5104'}`,
      loader: {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      },
    },
  });
  await app.startAllMicroservices();
  await app.listen(Number(configService.get<string>('CONVERSATION_SERVICE_PORT') ?? '3104'));
}

void bootstrap();
