import { Module } from '@nestjs/common';

import { READINESS_PROBE, ServicePlatformModule } from '@yourpassenger/platform';

import { ProfileModule } from './profile/profile.module';
import { ProfileReadinessProbe } from './profile/profile.readiness';

@Module({
  imports: [
    ServicePlatformModule.register({
      serviceName: 'profile-service',
      imports: [ProfileModule],
      readinessProbeProvider: {
        provide: READINESS_PROBE,
        useClass: ProfileReadinessProbe,
      },
    }),
    ProfileModule,
  ],
})
export class AppModule {}
