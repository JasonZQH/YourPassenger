import { Module } from '@nestjs/common';

import { ServicePlatformModule } from '@yourpassenger/platform';

import { ConversationModule } from './conversation/conversation.module';

@Module({
  imports: [
    ServicePlatformModule.register({
      serviceName: 'conversation-service',
      imports: [ConversationModule],
    }),
    ConversationModule,
  ],
})
export class AppModule {}
