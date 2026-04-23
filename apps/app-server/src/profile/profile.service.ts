import { Injectable } from '@nestjs/common';

import type { UpdateProfileBody, UserProfile } from '@yourpassenger/contracts';

import { DownstreamConfigService } from '../http/downstream-config.service';
import { DownstreamHttpService } from '../http/downstream-http.service';

@Injectable()
export class ProfileService {
  constructor(
    private readonly downstreamConfig: DownstreamConfigService,
    private readonly downstreamHttp: DownstreamHttpService,
  ) {}

  async getProfile(userId: string): Promise<UserProfile | null> {
    return this.downstreamHttp.get<UserProfile | null>(
      this.downstreamConfig.getProfileServiceBaseUrl(),
      `/profiles/${encodeURIComponent(userId)}`,
    );
  }

  async updateProfile(userId: string, body: UpdateProfileBody) {
    return this.downstreamHttp.put<{ success: boolean; profileCompleted: boolean }>(
      this.downstreamConfig.getProfileServiceBaseUrl(),
      `/profiles/${encodeURIComponent(userId)}`,
      body,
    );
  }
}
