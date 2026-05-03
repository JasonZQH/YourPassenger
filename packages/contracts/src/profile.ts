import {
  AgeRange,
  AvoidTopicTag,
  ConversationStyle,
  Gender,
  HobbyTag,
  InterestTag,
  OccupationCategory,
  ResponseLength,
} from './domain';

export interface UpdateProfileBody {
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
