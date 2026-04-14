import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { ConversationModule } from './conversation/conversation.module';
import { HealthModule } from './health/health.module';
import { ProfileModule } from './profile/profile.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SessionsModule } from './sessions/sessions.module';
import { StoreModule } from './store/store.module';

@Module({
  imports: [
    StoreModule,
    HealthModule,
    AuthModule,
    ProfileModule,
    ConversationModule,
    SessionsModule,
    RealtimeModule,
  ],
})
export class AppModule {}
