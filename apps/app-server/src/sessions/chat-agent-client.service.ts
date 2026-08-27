import { Injectable } from '@nestjs/common';

import type {
  DispatchChatAgentBody,
  DispatchChatAgentResponse,
} from '@yourpassenger/contracts';

import { DownstreamConfigService } from '../http/downstream-config.service';
import { DownstreamHttpService } from '../http/downstream-http.service';

@Injectable()
export class ChatAgentClientService {
  // Wires downstream chat-agent service calls for LiveKit sessions.
  constructor(
    private readonly downstreamConfig: DownstreamConfigService,
    private readonly downstreamHttp: DownstreamHttpService,
  ) {}

  // Requests a chat-agent worker to join a session room.
  async dispatchSessionAgent(
    body: DispatchChatAgentBody,
  ): Promise<DispatchChatAgentResponse> {
    return this.downstreamHttp.post<DispatchChatAgentResponse>(
      this.downstreamConfig.getChatAgentServiceBaseUrl(),
      '/agents/sessions',
      body,
    );
  }
}
