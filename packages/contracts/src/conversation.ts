import type { SessionRecord, SessionSummary } from './session';
import type { UserProfile } from './profile';

export interface BuildAssistantReplyBody {
  utterance: string;
  profile: UserProfile | null;
}

export interface AssistantReply {
  text: string;
}

export interface BuildRealtimeTurnBody {
  utterance: string;
  profile: UserProfile | null;
  session: SessionRecord;
}

export interface RealtimeTurnResponse {
  transcriptText: string;
  assistantText: string;
  audioFormat: 'mp3';
  audioPayload: string;
}

export interface BuildConversationSummaryBody {
  session: SessionRecord;
  profile: UserProfile | null;
}

export type ConversationSummary = SessionSummary;
