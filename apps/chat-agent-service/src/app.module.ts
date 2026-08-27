import { Module } from '@nestjs/common';

import { ServicePlatformModule } from '@yourpassenger/platform';

import { ChatAgentModule } from './chat-agent/chat-agent.module';

@Module({
  imports: [
    ServicePlatformModule.register({
      serviceName: 'chat-agent-service',
      imports: [ChatAgentModule],
    }),
    ChatAgentModule,
  ],
})
export class AppModule {}
