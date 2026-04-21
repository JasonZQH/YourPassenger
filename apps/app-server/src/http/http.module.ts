import { Module } from '@nestjs/common';

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
