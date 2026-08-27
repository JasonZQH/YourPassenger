export type AuthKind = 'apple' | 'guest';

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
