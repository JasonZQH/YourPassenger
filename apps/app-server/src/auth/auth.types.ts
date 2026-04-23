import type { IncomingHttpHeaders } from 'http';

import type { CurrentUserView } from '@yourpassenger/contracts';

export interface AuthContext {
  accessToken: string;
  user: CurrentUserView;
}

export interface AuthenticatedRequest {
  headers: IncomingHttpHeaders;
  authContext?: AuthContext;
}
