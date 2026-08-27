import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  AuthResponse,
  CurrentUserView,
  TokenPayload,
} from '@yourpassenger/contracts';

import { AuthRepository } from './auth.repository';
import type { AuthContext, AuthenticatedRequest } from './auth.types';

@Injectable()
export class AuthService {
  // Wires auth persistence and configuration dependencies for token operations.
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly configService: ConfigService,
  ) {}

  // Validates an Apple identity token and returns app-issued credentials.
  async signInWithApple(identityToken: string): Promise<AuthResponse> {
    const normalizedIdentityToken = identityToken.trim();
    if (!normalizedIdentityToken) {
      throw new UnauthorizedException('Apple identity token is required.');
    }

    const user = await this.authRepository.signInWithApple(normalizedIdentityToken);
    return this.buildAuthResponse(user);
  }

  // Creates an anonymous guest user and returns app-issued credentials.
  async signInAsGuest(): Promise<AuthResponse> {
    const user = await this.authRepository.createGuestUser();
    return this.buildAuthResponse(user);
  }

  // Resolves the current authenticated user from the incoming request.
  async getCurrentUser(request: AuthenticatedRequest): Promise<CurrentUserView> {
    const { user } = await this.requireAuth(request);
    return user;
  }

  // Requires a valid bearer token and caches the auth context on the request.
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

  // Verifies an access token and loads the user it represents.
  async authenticateAccessToken(accessToken: string): Promise<CurrentUserView> {
    const payload = this.verifyToken(accessToken, 'access');
    const user = await this.authRepository.getCurrentUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User for token was not found.');
    }

    return user;
  }

  // Builds the public auth response with access and refresh tokens.
  private buildAuthResponse(user: CurrentUserView): AuthResponse {
    return {
      accessToken: this.issueToken(user.id, 'access'),
      refreshToken: this.issueToken(user.id, 'refresh'),
      user,
    };
  }

  // Issues a signed token payload for a user and token kind.
  private issueToken(userId: string, kind: TokenPayload['kind']): string {
    const payload: TokenPayload = {
      sub: userId,
      kind,
      iat: Date.now(),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.sign(encodedPayload);

    return `${encodedPayload}.${signature}`;
  }

  // Validates token structure, signature, kind, and subject.
  private verifyToken(
    token: string,
    expectedKind: TokenPayload['kind'],
  ): TokenPayload {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('Token format is invalid.');
    }

    const expectedSignature = this.sign(encodedPayload);
    const providedSignatureBuffer = Buffer.from(signature, 'utf8');
    const expectedSignatureBuffer = Buffer.from(expectedSignature, 'utf8');
    if (
      providedSignatureBuffer.length !== expectedSignatureBuffer.length ||
      !timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)
    ) {
      throw new UnauthorizedException('Token signature is invalid.');
    }

    let payload: TokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as TokenPayload;
    } catch {
      throw new UnauthorizedException('Token payload is invalid.');
    }

    if (payload.kind !== expectedKind || !payload.sub) {
      throw new UnauthorizedException('Token kind is invalid.');
    }

    return payload;
  }

  // Signs an encoded token payload with the configured HMAC secret.
  private sign(encodedPayload: string): string {
    return createHmac('sha256', this.getTokenSecret())
      .update(encodedPayload)
      .digest('base64url');
  }

  // Reads the shared auth token secret from service configuration.
  private getTokenSecret(): string {
    return this.configService.getOrThrow<string>('AUTH_TOKEN_SECRET');
  }

  // Extracts the raw bearer token from an Authorization header.
  private extractBearerToken(
    authorizationHeader?: string | string[],
  ): string | null {
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
