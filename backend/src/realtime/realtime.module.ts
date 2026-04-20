import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ConversationModule } from '../conversation/conversation.module';
import { ProfileModule } from '../profile/profile.module';
import { SessionsModule } from '../sessions/sessions.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule, SessionsModule, ProfileModule, ConversationModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
