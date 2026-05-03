import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import {
  BuildRealtimeTurnBody,
  CONVERSATION_HOT_PATH_CLIENT,
  CONVERSATION_HOT_PATH_SERVICE,
  GrpcBuildRealtimeTurnRequest,
  GrpcRealtimeTurnReply,
  RealtimeTurnResponse,
} from '@yourpassenger/contracts';
import { firstValueFrom, Observable } from 'rxjs';

import type {
  AssistantReply,
  BuildAssistantReplyBody,
  BuildConversationSummaryBody,
  ConversationSummary,
} from '@yourpassenger/contracts';

import { DownstreamConfigService } from '../http/downstream-config.service';
import { DownstreamHttpService } from '../http/downstream-http.service';

interface ConversationHotPathGrpcClient {
  buildRealtimeTurn(request: GrpcBuildRealtimeTurnRequest): Observable<GrpcRealtimeTurnReply>;
}

@Injectable()
export class ConversationClientService implements OnModuleInit {
  private grpcHotPathClient!: ConversationHotPathGrpcClient;

  constructor(
    @Inject(CONVERSATION_HOT_PATH_CLIENT)
    private readonly conversationGrpcClient: ClientGrpc,
    private readonly downstreamConfig: DownstreamConfigService,
    private readonly downstreamHttp: DownstreamHttpService,
  ) {}

  onModuleInit() {
    this.grpcHotPathClient = this.conversationGrpcClient.getService<ConversationHotPathGrpcClient>(
      CONVERSATION_HOT_PATH_SERVICE,
    );
  }

  async buildAssistantReply(body: BuildAssistantReplyBody): Promise<AssistantReply> {
    return this.downstreamHttp.post<AssistantReply>(
      this.downstreamConfig.getConversationServiceBaseUrl(),
      '/conversation/reply',
      body,
    );
  }

  async buildRealtimeTurn(body: BuildRealtimeTurnBody): Promise<RealtimeTurnResponse> {
    const response = await firstValueFrom(
      this.grpcHotPathClient.buildRealtimeTurn(this.toGrpcRealtimeTurnRequest(body)),
    );
    return {
      transcriptText: response.transcriptText,
      assistantText: response.assistantText,
      audioFormat: 'mp3',
      audioPayload: response.audioPayload,
    };
  }

  async buildSummary(body: BuildConversationSummaryBody): Promise<ConversationSummary> {
    return this.downstreamHttp.post<ConversationSummary>(
      this.downstreamConfig.getConversationServiceBaseUrl(),
      '/conversation/summary',
      body,
    );
  }

  private toGrpcRealtimeTurnRequest(body: BuildRealtimeTurnBody): GrpcBuildRealtimeTurnRequest {
    return {
      utterance: body.utterance,
      hasProfile: body.profile !== null,
      profile: body.profile
        ? {
            userId: body.profile.userId,
            nickname: body.profile.nickname,
            interests: [...body.profile.interests],
            ageRange: body.profile.ageRange,
            gender: body.profile.gender,
            occupationCategory: body.profile.occupationCategory,
            hobbyTags: [...body.profile.hobbyTags],
            preferredLanguage: body.profile.preferredLanguage,
            conversationStyle: body.profile.conversationStyle,
            responseLength: body.profile.responseLength,
            proactiveTopicPushing: body.profile.proactiveTopicPushing,
            avoidTopicTags: [...body.profile.avoidTopicTags],
            updatedAt: body.profile.updatedAt,
          }
        : undefined,
      session: {
        id: body.session.id,
        status: body.session.status,
        startedAt: body.session.startedAt,
        endedAt: body.session.endedAt ?? '',
        latestAssistantState: body.session.latestAssistantState,
        turns: body.session.turns.map((turn) => ({
          role: turn.role,
          text: turn.text,
          createdAt: turn.createdAt,
        })),
      },
    };
  }
}
