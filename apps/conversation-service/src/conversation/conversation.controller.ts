import { Body, Controller, Post } from '@nestjs/common';

import type {
  BuildAssistantReplyBody,
  BuildRealtimeTurnBody,
  BuildConversationSummaryBody,
} from '@yourpassenger/contracts';

import { ConversationService } from './conversation.service';

@Controller('conversation')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post('reply')
  async buildAssistantReply(@Body() body: BuildAssistantReplyBody) {
    return this.conversationService.buildAssistantReply(body);
  }

  @Post('realtime-turn')
  async buildRealtimeTurn(@Body() body: BuildRealtimeTurnBody) {
    return this.conversationService.buildRealtimeTurn(body);
  }

  @Post('summary')
  async buildSummary(@Body() body: BuildConversationSummaryBody) {
    return this.conversationService.buildSummary(body);
  }
}
