import { Injectable } from '@nestjs/common';

import type { ReadinessCheck, ReadinessProbe } from '@yourpassenger/platform';

import { DownstreamConfigService } from './downstream-config.service';
import { DownstreamHttpService } from './downstream-http.service';

@Injectable()
export class AppServerReadinessProbe implements ReadinessProbe {
  constructor(
    private readonly downstreamConfig: DownstreamConfigService,
    private readonly downstreamHttp: DownstreamHttpService,
  ) {}

  async check(): Promise<ReadinessCheck[]> {
    const checks = await Promise.all([
      this.checkService('auth-service', this.downstreamConfig.getAuthServiceBaseUrl()),
      this.checkService(
        'profile-service',
        this.downstreamConfig.getProfileServiceBaseUrl(),
      ),
      this.checkService(
        'session-service',
        this.downstreamConfig.getSessionServiceBaseUrl(),
      ),
      this.checkService(
        'conversation-service',
        this.downstreamConfig.getConversationServiceBaseUrl(),
      ),
    ]);

    return checks;
  }

  private async checkService(name: string, baseUrl: string): Promise<ReadinessCheck> {
    try {
      await this.downstreamHttp.get(baseUrl, '/health/ready');
      return { name, status: 'up' };
    } catch (error) {
      return {
        name,
        status: 'down',
        details: {
          error: error instanceof Error ? error.message : 'unknown readiness failure',
        },
      };
    }
  }
}
