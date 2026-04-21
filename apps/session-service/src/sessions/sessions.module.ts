import { Module } from '@nestjs/common';

import { SessionsController } from './sessions.controller';
import { SessionsPrismaService } from './sessions.prisma.service';
import { SessionsReadinessProbe } from './sessions.readiness';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [SessionsController],
  providers: [
    SessionsPrismaService,
    SessionsReadinessProbe,
    SessionsRepository,
    SessionsService,
  ],
  exports: [
    SessionsPrismaService,
    SessionsReadinessProbe,
    SessionsRepository,
    SessionsService,
  ],
})
export class SessionsModule {}
