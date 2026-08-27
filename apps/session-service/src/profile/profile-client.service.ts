import { HttpException, Injectable } from '@nestjs/common';
import type { UserProfile } from '@yourpassenger/contracts';

import { DownstreamConfigService } from '../http/downstream-config.service';
import { DownstreamHttpService } from '../http/downstream-http.service';

@Injectable()
export class ProfileClientService {
  // Wires downstream configuration and HTTP transport for profile calls.
  constructor(
    private readonly downstreamConfig: DownstreamConfigService,
    private readonly downstreamHttp: DownstreamHttpService,
  ) {}

  // Loads a user profile from the profile service and treats 404 as missing.
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
