import { Module } from '@nestjs/common';

import { ChatAgentController } from './chat-agent.controller';
import { ChatAgentService } from './chat-agent.service';
import { LiveKitAgentConfigService } from './livekit-agent-config.service';
import { DownstreamConfigService } from '../http/downstream-config.service';
import { DownstreamHttpService } from '../http/downstream-http.service';

@Module({
  controllers: [ChatAgentController],
  providers: [
    ChatAgentService,
    DownstreamConfigService,
    DownstreamHttpService,
    LiveKitAgentConfigService,
  ],
  exports: [ChatAgentService],
})
export class ChatAgentModule {}
