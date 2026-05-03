import { AssistantState, MessageRole, SessionStatus } from './domain';

export interface CreateSessionBody {
  source: 'manual_start';
}

export interface EndSessionBody {
  reason: 'manual_end';
}

export interface SessionTurn {
  role: MessageRole;
  text: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  status: SessionStatus;
  startedAt: string;
  endedAt?: string;
  latestAssistantState: AssistantState;
  turns: SessionTurn[];
}

export interface SessionSummary {
  sessionId: string;
  durationSeconds: number;
  summary: string;
  topics: string[];
  memoryCandidates: string[];
}

export interface OwnedSessionQuery {
  userId: string;
}

export interface CreateOwnedSessionBody extends CreateSessionBody {
  userId: string;
}

export interface SessionSummaryInput {
  durationSeconds: number;
  summary: string;
  topics: string[];
  memoryCandidates: string[];
}

export interface EndOwnedSessionBody extends EndSessionBody {
  userId: string;
  summary?: SessionSummaryInput;
}

export interface AppendSessionTurnBody {
  userId: string;
  role: MessageRole;
  text: string;
}

export interface UpdateAssistantStateBody {
  userId: string;
  state: AssistantState;
}

export interface CommitRealtimeTurnBody {
  userId: string;
  transcriptText: string;
  assistantText: string;
  finalAssistantState?: AssistantState;
}

export interface UpsertSessionSummaryBody extends SessionSummaryInput {
  userId: string;
}
