import { Body, Controller, Post } from '@nestjs/common';

import type {
  BuildAssistantReplyBody,
  BuildRealtimeTurnBody,
  BuildConversationSummaryBody,
} from '@yourpassenger/contracts';

import { ConversationService } from './conversation.service';

@Controller('conversation')
export class ConversationController {
  // Receives conversation HTTP requests and delegates generation work.
  constructor(private readonly conversationService: ConversationService) {}

  @Post('reply')
  // Builds a single assistant reply for a text request.
  async buildAssistantReply(@Body() body: BuildAssistantReplyBody) {
    return this.conversationService.buildAssistantReply(body);
  }

  @Post('realtime-turn')
  // Builds a realtime turn response over HTTP.
  async buildRealtimeTurn(@Body() body: BuildRealtimeTurnBody) {
    return this.conversationService.buildRealtimeTurn(body);
  }

  @Post('summary')
  // Builds a conversation summary for a completed session.
  async buildSummary(@Body() body: BuildConversationSummaryBody) {
    return this.conversationService.buildSummary(body);
  }
}
