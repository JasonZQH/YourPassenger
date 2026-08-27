import { AuthKind } from './domain';

export interface AppleAuthBody {
  identityToken: string;
}

export interface TokenPayload {
  sub: string;
  kind: 'access' | 'refresh';
  iat: number;
}

export interface CurrentUserView {
  id: string;
  nickname: string;
  profileCompleted: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: CurrentUserView;
}

export interface AuthIdentityRecord {
  id: string;
  authKind: AuthKind;
  providerUserId: string;
  createdAt: string;
  updatedAt: string;
}
