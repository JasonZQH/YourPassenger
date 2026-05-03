import { Module } from '@nestjs/common';

import { ConversationClientService } from '../conversation/conversation-client.service';
import { DownstreamConfigService } from '../http/downstream-config.service';
import { DownstreamHttpService } from '../http/downstream-http.service';
import { ProfileClientService } from '../profile/profile-client.service';
import { SessionsController } from './sessions.controller';
import { SessionsPrismaService } from './sessions.prisma.service';
import { SessionsReadinessProbe } from './sessions.readiness';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [SessionsController],
  providers: [
    DownstreamConfigService,
    DownstreamHttpService,
    ProfileClientService,
    ConversationClientService,
    SessionsPrismaService,
    SessionsReadinessProbe,
    SessionsRepository,
    SessionsService,
  ],
  exports: [
    DownstreamConfigService,
    DownstreamHttpService,
    ProfileClientService,
    ConversationClientService,
    SessionsPrismaService,
    SessionsReadinessProbe,
    SessionsRepository,
    SessionsService,
  ],
})
export class SessionsModule {}
