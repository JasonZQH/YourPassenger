import { Module } from '@nestjs/common';

import { READINESS_PROBE, ServicePlatformModule } from '@yourpassenger/platform';

import { AuthModule } from './auth/auth.module';
import { AuthReadinessProbe } from './auth/auth.readiness';

@Module({
  imports: [
    ServicePlatformModule.register({
      serviceName: 'auth-service',
      imports: [AuthModule],
      readinessProbeProvider: {
        provide: READINESS_PROBE,
        useClass: AuthReadinessProbe,
      },
    }),
    AuthModule,
  ],
})
export class AppModule {}
