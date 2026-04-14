import { Module } from '@nestjs/common';

import { ConversationOrchestratorService } from './conversation.service';

@Module({
  providers: [ConversationOrchestratorService],
  exports: [ConversationOrchestratorService],
})
export class ConversationModule {}
