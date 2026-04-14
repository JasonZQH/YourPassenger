export type InterestTag =
  | 'history'
  | 'international_news'
  | 'sports'
  | 'travel'
  | 'gaming'
  | 'technology'
  | 'finance'
  | 'movies'
  | 'music';

export type AgeRange =
  | 'under_18'
  | '18_24'
  | '25_34'
  | '35_44'
  | '45_54'
  | '55_plus';

export type Gender =
  | 'female'
  | 'male'
  | 'nonbinary'
  | 'prefer_not_to_say';

export type OccupationCategory =
  | 'student'
  | 'tech'
  | 'finance'
  | 'healthcare'
  | 'education'
  | 'creative'
  | 'business'
  | 'service'
  | 'logistics'
  | 'other';

export type HobbyTag =
  | 'reading'
  | 'fitness'
  | 'cooking'
  | 'photography'
  | 'music'
  | 'movies'
  | 'hiking'
  | 'cars'
  | 'podcasts'
  | 'design';

export type ConversationStyle = 'relaxed' | 'curious' | 'analytical';
export type ResponseLength = 'short' | 'medium';
export type AvoidTopicTag =
  | 'politics'
  | 'religion'
  | 'graphic_violence'
  | 'personal_finance'
  | 'dating';

export type SessionStatus = 'active' | 'ended';
export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type MessageRole = 'user' | 'assistant';

export interface AuthUser {
  id: string;
  nickname: string;
  profileCompleted: boolean;
}

export interface UserProfile {
  userId: string;
  nickname: string;
  interests: InterestTag[];
  ageRange: AgeRange;
  gender: Gender;
  occupationCategory: OccupationCategory;
  hobbyTags: HobbyTag[];
  preferredLanguage: string;
  conversationStyle: ConversationStyle;
  responseLength: ResponseLength;
  proactiveTopicPushing: boolean;
  avoidTopicTags: AvoidTopicTag[];
  updatedAt: string;
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
