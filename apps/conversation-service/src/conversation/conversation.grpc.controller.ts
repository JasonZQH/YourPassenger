import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
  BuildRealtimeTurnBody,
  CONVERSATION_HOT_PATH_SERVICE,
  GrpcBuildRealtimeTurnRequest,
  GrpcRealtimeTurnReply,
  RealtimeTurnResponse,
  SessionRecord,
  UserProfile,
} from '@yourpassenger/contracts';

import { ConversationService } from './conversation.service';

@Controller()
export class ConversationGrpcController {
  constructor(private readonly conversationService: ConversationService) {}

  @GrpcMethod(CONVERSATION_HOT_PATH_SERVICE, 'BuildRealtimeTurn')
  buildRealtimeTurn(request: GrpcBuildRealtimeTurnRequest): GrpcRealtimeTurnReply {
    const response = this.conversationService.buildRealtimeTurn(
      this.toRealtimeTurnBody(request),
    );
    return this.toGrpcResponse(response);
  }

  private toRealtimeTurnBody(request: GrpcBuildRealtimeTurnRequest): BuildRealtimeTurnBody {
    return {
      utterance: request.utterance,
      profile:
        request.hasProfile && request.profile
          ? ({
              userId: request.profile.userId,
              nickname: request.profile.nickname,
              interests: [...request.profile.interests],
              ageRange: request.profile.ageRange,
              gender: request.profile.gender,
              occupationCategory: request.profile.occupationCategory,
              hobbyTags: [...request.profile.hobbyTags],
              preferredLanguage: request.profile.preferredLanguage,
              conversationStyle: request.profile.conversationStyle,
              responseLength: request.profile.responseLength,
              proactiveTopicPushing: request.profile.proactiveTopicPushing,
              avoidTopicTags: [...request.profile.avoidTopicTags],
              updatedAt: request.profile.updatedAt,
            } as UserProfile)
          : null,
      session: {
        id: request.session.id,
        status: request.session.status,
        startedAt: request.session.startedAt,
        endedAt: request.session.endedAt || undefined,
        latestAssistantState: request.session.latestAssistantState,
        turns: request.session.turns.map((turn) => ({
          role: turn.role,
          text: turn.text,
          createdAt: turn.createdAt,
        })),
      } as SessionRecord,
    };
  }

  private toGrpcResponse(response: RealtimeTurnResponse): GrpcRealtimeTurnReply {
    return {
      transcriptText: response.transcriptText,
      assistantText: response.assistantText,
      audioFormat: response.audioFormat,
      audioPayload: response.audioPayload,
    };
  }
}
