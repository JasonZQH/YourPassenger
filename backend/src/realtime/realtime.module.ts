import { Module } from '@nestjs/common';

import { ConversationModule } from '../conversation/conversation.module';
import { ProfileModule } from '../profile/profile.module';
import { SessionsModule } from '../sessions/sessions.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [SessionsModule, ProfileModule, ConversationModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
