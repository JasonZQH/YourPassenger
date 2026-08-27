import { Module } from '@nestjs/common';

import { ConversationController } from './conversation.controller';
import { ConversationGrpcController } from './conversation.grpc.controller';
import { ConversationService } from './conversation.service';

@Module({
  controllers: [ConversationController, ConversationGrpcController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
