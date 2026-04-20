import type { IncomingHttpHeaders } from 'http';

import { AuthUser } from '../common/types';

export interface AppleAuthBody {
  identityToken: string;
}

export interface TokenPayload {
  sub: string;
  kind: 'access' | 'refresh';
  iat: number;
}

export interface AuthContext {
  accessToken: string;
  user: AuthUser;
}

export interface AuthenticatedRequest {
  headers: IncomingHttpHeaders;
  authContext?: AuthContext;
}
