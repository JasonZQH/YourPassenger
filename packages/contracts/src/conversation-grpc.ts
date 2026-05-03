import path from 'path';

export const CONVERSATION_HOT_PATH_PACKAGE = 'yourpassenger.conversation';
export const CONVERSATION_HOT_PATH_SERVICE = 'ConversationHotPathService';
export const CONVERSATION_HOT_PATH_CLIENT = 'CONVERSATION_HOT_PATH_CLIENT';
const contractsPackageRoot = path.dirname(require.resolve('@yourpassenger/contracts/package.json'));
export const CONVERSATION_HOT_PATH_PROTO_PATH = path.join(
  contractsPackageRoot,
  'proto',
  'conversation-hot-path.proto',
);

export interface GrpcUserProfile {
  userId: string;
  nickname: string;
  interests: string[];
  ageRange: string;
  gender: string;
  occupationCategory: string;
  hobbyTags: string[];
  preferredLanguage: string;
  conversationStyle: string;
  responseLength: string;
  proactiveTopicPushing: boolean;
  avoidTopicTags: string[];
  updatedAt: string;
}

export interface GrpcSessionTurn {
  role: string;
  text: string;
  createdAt: string;
}

export interface GrpcSessionRecord {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string;
  latestAssistantState: string;
  turns: GrpcSessionTurn[];
}

export interface GrpcBuildRealtimeTurnRequest {
  utterance: string;
  hasProfile: boolean;
  profile?: GrpcUserProfile;
  session: GrpcSessionRecord;
}

export interface GrpcRealtimeTurnReply {
  transcriptText: string;
  assistantText: string;
  audioFormat: string;
  audioPayload: string;
}
