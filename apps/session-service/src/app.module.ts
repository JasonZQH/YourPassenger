import { Module } from '@nestjs/common';

import { READINESS_PROBE, ServicePlatformModule } from '@yourpassenger/platform';

import { SessionsModule } from './sessions/sessions.module';
import { SessionsReadinessProbe } from './sessions/sessions.readiness';

@Module({
  imports: [
    ServicePlatformModule.register({
      serviceName: 'session-service',
      imports: [SessionsModule],
      readinessProbeProvider: {
        provide: READINESS_PROBE,
        useClass: SessionsReadinessProbe,
      },
    }),
    SessionsModule,
  ],
})
export class AppModule {}
