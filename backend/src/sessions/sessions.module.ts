import { Module } from '@nestjs/common';

import { ConversationModule } from '../conversation/conversation.module';
import { ProfileModule } from '../profile/profile.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [ProfileModule, ConversationModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
