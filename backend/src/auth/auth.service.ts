import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthUser } from '../common/types';
import { StoreService } from '../store/store.service';
import {
  AuthContext,
  AuthenticatedRequest,
  TokenPayload,
} from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly store: StoreService,
    private readonly configService: ConfigService,
  ) {}

  async signInWithApple(identityToken: string) {
    const normalizedIdentityToken = identityToken.trim();
    if (!normalizedIdentityToken) {
      throw new UnauthorizedException('Apple identity token is required.');
    }

    const user = await this.store.signInWithApple(normalizedIdentityToken);

    return this.buildAuthResponse(user);
  }

  async signInAsGuest() {
    const user = await this.store.createGuestUser();

    return this.buildAuthResponse(user);
  }

  async getCurrentUser(request: AuthenticatedRequest) {
    const { user } = await this.requireAuth(request);
    return user;
  }

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

  async authenticateAccessToken(accessToken: string): Promise<AuthUser> {
    const payload = this.verifyToken(accessToken, 'access');
    const user = await this.store.getUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User for token was not found.');
    }

    return user;
  }

  private buildAuthResponse(user: AuthUser) {
    return {
      accessToken: this.issueToken(user.id, 'access'),
      refreshToken: this.issueToken(user.id, 'refresh'),
      user,
    };
  }

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

  private verifyToken(token: string, expectedKind: TokenPayload['kind']): TokenPayload {
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
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TokenPayload;
    } catch {
      throw new UnauthorizedException('Token payload is invalid.');
    }

    if (payload.kind !== expectedKind || !payload.sub) {
      throw new UnauthorizedException('Token kind is invalid.');
    }

    return payload;
  }

  private sign(encodedPayload: string): string {
    return createHmac('sha256', this.getTokenSecret()).update(encodedPayload).digest('base64url');
  }

  private getTokenSecret(): string {
    return this.configService.get<string>('AUTH_TOKEN_SECRET') ?? 'dev-only-token-secret';
  }

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
