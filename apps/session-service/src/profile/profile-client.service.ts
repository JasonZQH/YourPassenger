import { HttpException, Injectable } from '@nestjs/common';
import type { UserProfile } from '@yourpassenger/contracts';

import { DownstreamConfigService } from '../http/downstream-config.service';
import { DownstreamHttpService } from '../http/downstream-http.service';

@Injectable()
export class ProfileClientService {
  constructor(
    private readonly downstreamConfig: DownstreamConfigService,
    private readonly downstreamHttp: DownstreamHttpService,
  ) {}

  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      return await this.downstreamHttp.get<UserProfile | null>(
        this.downstreamConfig.getProfileServiceBaseUrl(),
        `/profiles/${encodeURIComponent(userId)}`,
      );
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 404) {
        return null;
      }
      throw error;
    }
  }
}
