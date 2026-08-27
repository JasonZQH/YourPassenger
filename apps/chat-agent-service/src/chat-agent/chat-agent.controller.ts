import { Body, Controller, Get, Post } from '@nestjs/common';

import type {
  DispatchChatAgentBody,
  DispatchChatAgentResponse,
} from '@yourpassenger/contracts';

import { ChatAgentService } from './chat-agent.service';

@Controller('agents')
export class ChatAgentController {
  // Receives chat-agent HTTP requests and delegates room management.
  constructor(private readonly chatAgentService: ChatAgentService) {}

  @Post('sessions')
  // Dispatches or reuses the agent for a LiveKit session room.
  async dispatchSessionAgent(
    @Body() body: DispatchChatAgentBody,
  ): Promise<DispatchChatAgentResponse> {
    return this.chatAgentService.dispatchSessionAgent(body);
  }

  @Get('sessions')
  // Lists active chat-agent room runtimes.
  listSessionAgents(): DispatchChatAgentResponse[] {
    return this.chatAgentService.listSessionAgents();
  }
}
