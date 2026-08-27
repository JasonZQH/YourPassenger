import { Injectable } from '@nestjs/common';
import type {
  BuildConversationSummaryBody,
  ConversationSummary,
} from '@yourpassenger/contracts';

import { DownstreamConfigService } from '../http/downstream-config.service';
import { DownstreamHttpService } from '../http/downstream-http.service';

@Injectable()
export class ConversationClientService {
  // Wires downstream configuration and HTTP transport for conversation calls.
  constructor(
    private readonly downstreamConfig: DownstreamConfigService,
    private readonly downstreamHttp: DownstreamHttpService,
  ) {}

  // Requests a conversation summary from the conversation service.
  async buildSummary(body: BuildConversationSummaryBody): Promise<ConversationSummary> {
    return this.downstreamHttp.post<ConversationSummary>(
      this.downstreamConfig.getConversationServiceBaseUrl(),
      '/conversation/summary',
      body,
    );
  }
}
