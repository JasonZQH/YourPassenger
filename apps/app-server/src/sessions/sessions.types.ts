import type { SessionRecord } from '@yourpassenger/contracts';

export interface PublicSessionView {
  id: string;
  status: SessionRecord['status'];
  startedAt: string;
  endedAt?: string;
  latestAssistantState: SessionRecord['latestAssistantState'];
}

export interface CreateSessionResponse {
  session: Pick<PublicSessionView, 'id' | 'status' | 'startedAt'>;
  realtime: {
    wsUrl: string;
    token: string;
  };
}
