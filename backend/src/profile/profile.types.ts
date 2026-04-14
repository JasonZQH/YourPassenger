import {
  AgeRange,
  AvoidTopicTag,
  ConversationStyle,
  Gender,
  HobbyTag,
  InterestTag,
  OccupationCategory,
  ResponseLength,
} from '../common/types';

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
