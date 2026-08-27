import { Injectable } from '@nestjs/common';

import type { UpdateProfileBody, UserProfile } from '@yourpassenger/contracts';

import { DownstreamConfigService } from '../http/downstream-config.service';
import { DownstreamHttpService } from '../http/downstream-http.service';

@Injectable()
export class ProfileService {
  // Wires downstream profile service calls for app-server profile routes.
  constructor(
    private readonly downstreamConfig: DownstreamConfigService,
    private readonly downstreamHttp: DownstreamHttpService,
  ) {}

  // Fetches the authenticated user's profile from the profile service.
  async getProfile(userId: string): Promise<UserProfile | null> {
    return this.downstreamHttp.get<UserProfile | null>(
      this.downstreamConfig.getProfileServiceBaseUrl(),
      `/profiles/${encodeURIComponent(userId)}`,
    );
  }

  // Persists the authenticated user's profile through the profile service.
  async updateProfile(userId: string, body: UpdateProfileBody) {
    return this.downstreamHttp.put<{ success: boolean; profileCompleted: boolean }>(
      this.downstreamConfig.getProfileServiceBaseUrl(),
      `/profiles/${encodeURIComponent(userId)}`,
      body,
    );
  }
}
