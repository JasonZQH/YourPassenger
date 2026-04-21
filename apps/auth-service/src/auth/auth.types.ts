import type { IncomingHttpHeaders } from 'http';

import type { CurrentUserView, TokenPayload } from '@yourpassenger/contracts';

export interface AuthContext {
  accessToken: string;
  user: CurrentUserView;
}

export interface AuthenticatedRequest {
  headers: IncomingHttpHeaders;
  authContext?: AuthContext;
}

export type AuthTokenPayload = TokenPayload;
