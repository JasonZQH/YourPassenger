import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  CONVERSATION_HOT_PATH_CLIENT,
  CONVERSATION_HOT_PATH_PACKAGE,
  CONVERSATION_HOT_PATH_PROTO_PATH,
} from '@yourpassenger/contracts';

import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { ConversationClientService } from '../conversation/conversation.service';
import { ProfileController } from '../profile/profile.controller';
import { ProfileService } from '../profile/profile.service';
import { SessionsController } from '../sessions/sessions.controller';
import { SessionsService } from '../sessions/sessions.service';
import { DownstreamConfigService } from './downstream-config.service';
import { DownstreamHttpService } from './downstream-http.service';
import { AppServerReadinessProbe } from './http.readiness';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: CONVERSATION_HOT_PATH_CLIENT,
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: CONVERSATION_HOT_PATH_PACKAGE,
            protoPath: CONVERSATION_HOT_PATH_PROTO_PATH,
            url: configService.get<string>('CONVERSATION_SERVICE_GRPC_URL') ?? 'localhost:5104',
            loader: {
              keepCase: true,
              longs: String,
              enums: String,
              defaults: true,
              oneofs: true,
            },
          },
        }),
      },
    ]),
  ],
  controllers: [AuthController, ProfileController, SessionsController],
  providers: [
    DownstreamConfigService,
    DownstreamHttpService,
    AppServerReadinessProbe,
    AuthService,
    ConversationClientService,
    ProfileService,
    SessionsService,
  ],
  exports: [
    DownstreamConfigService,
    DownstreamHttpService,
    AppServerReadinessProbe,
    AuthService,
    ConversationClientService,
    ProfileService,
    SessionsService,
  ],
})
export class HttpModule {}
