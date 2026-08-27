import { Injectable, UnauthorizedException } from '@nestjs/common';

import type { AuthResponse, CurrentUserView, UserProfile } from '@yourpassenger/contracts';

import { DownstreamConfigService } from '../http/downstream-config.service';
import { DownstreamHttpService } from '../http/downstream-http.service';
import type { AuthContext, AuthenticatedRequest } from './auth.types';

@Injectable()
export class AuthService {
  // Wires downstream auth/profile services for app-server auth projection.
  constructor(
    private readonly downstreamConfig: DownstreamConfigService,
    private readonly downstreamHttp: DownstreamHttpService,
  ) {}

  // Proxies Apple sign-in and enriches the user with profile state.
  async signInWithApple(identityToken: string): Promise<AuthResponse> {
    const response = await this.downstreamHttp.post<AuthResponse>(
      this.downstreamConfig.getAuthServiceBaseUrl(),
      '/auth/apple',
      { identityToken },
    );

    return this.withProfileProjection(response);
  }

  // Proxies guest sign-in and enriches the user with profile state.
  async signInAsGuest(): Promise<AuthResponse> {
    const response = await this.downstreamHttp.post<AuthResponse>(
      this.downstreamConfig.getAuthServiceBaseUrl(),
      '/auth/guest',
    );

    return this.withProfileProjection(response);
  }

  // Resolves the current authenticated user from the request.
  async getCurrentUser(request: AuthenticatedRequest): Promise<CurrentUserView> {
    const { user } = await this.requireAuth(request);
    return user;
  }

  // Requires bearer auth and caches the resolved auth context.
  async requireAuth(request: AuthenticatedRequest): Promise<AuthContext> {
    if (request.authContext) {
      return request.authContext;
    }

    const accessToken = this.extractBearerToken(request.headers.authorization);
    if (!accessToken) {
      throw new UnauthorizedException('Bearer token is required.');
    }

    const user = await this.authenticateAccessToken(accessToken);
    const authContext = { accessToken, user };
    request.authContext = authContext;
    return authContext;
  }

  // Validates an access token by asking the auth service for the current user.
  async authenticateAccessToken(accessToken: string): Promise<CurrentUserView> {
    const downstreamUser = await this.downstreamHttp.get<CurrentUserView>(
      this.downstreamConfig.getAuthServiceBaseUrl(),
      '/me',
      {
        Authorization: `Bearer ${accessToken}`,
      },
    );

    return this.attachProfileProjection(downstreamUser);
  }

  // Replaces the auth response user with a profile-aware projection.
  private async withProfileProjection(response: AuthResponse): Promise<AuthResponse> {
    return {
      ...response,
      user: await this.attachProfileProjection(response.user),
    };
  }

  // Adds nickname and completion state from the profile service.
  private async attachProfileProjection(user: CurrentUserView): Promise<CurrentUserView> {
    const profile = await this.getProfile(user.id);
    return {
      id: user.id,
      nickname: profile?.nickname ?? user.nickname,
      profileCompleted: profile !== null,
    };
  }

  // Loads a user profile through the profile service.
  private async getProfile(userId: string): Promise<UserProfile | null> {
    return this.downstreamHttp.get<UserProfile | null>(
      this.downstreamConfig.getProfileServiceBaseUrl(),
      `/profiles/${encodeURIComponent(userId)}`,
    );
  }

  // Extracts the raw bearer token from an Authorization header.
  private extractBearerToken(authorizationHeader?: string | string[]): string | null {
    const headerValue = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]
      : authorizationHeader;
    if (!headerValue) {
      return null;
    }

    const [scheme, token] = headerValue.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    return token;
  }
}
