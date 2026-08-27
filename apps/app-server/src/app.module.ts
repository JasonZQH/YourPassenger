import { Module } from '@nestjs/common';

import { READINESS_PROBE, ServicePlatformModule } from '@yourpassenger/platform';

import { HttpModule } from './http/http.module';
import { AppServerReadinessProbe } from './http/http.readiness';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ServicePlatformModule.register({
      serviceName: 'app-server',
      imports: [HttpModule],
      readinessProbeProvider: {
        provide: READINESS_PROBE,
        useClass: AppServerReadinessProbe,
      },
    }),
    HttpModule,
    RealtimeModule,
  ],
})
export class AppModule {}
