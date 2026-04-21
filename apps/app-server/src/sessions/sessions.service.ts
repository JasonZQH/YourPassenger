import { Injectable } from '@nestjs/common';

import type {
  AssistantState,
  CreateSessionBody,
  CreateOwnedSessionBody,
  EndOwnedSessionBody,
  EndSessionBody,
  MessageRole,
  SessionRecord,
  SessionSummary,
} from '@yourpassenger/contracts';

import { ConversationClientService } from '../conversation/conversation.service';
import { DownstreamConfigService } from '../http/downstream-config.service';
import { DownstreamHttpService } from '../http/downstream-http.service';
import { ProfileService } from '../profile/profile.service';
import type { CreateSessionResponse, PublicSessionView } from './sessions.types';

@Injectable()
export class SessionsService {
  constructor(
    private readonly downstreamConfig: DownstreamConfigService,
    private readonly downstreamHttp: DownstreamHttpService,
    private readonly conversationService: ConversationClientService,
    private readonly profileService: ProfileService,
  ) {}

  async createSession(
    userId: string,
    accessToken: string,
    body: CreateSessionBody,
  ): Promise<CreateSessionResponse> {
    const session = await this.downstreamHttp.post<SessionRecord>(
      this.downstreamConfig.getSessionServiceBaseUrl(),
      '/sessions',
      {
        userId,
        source: body.source,
      } satisfies CreateOwnedSessionBody,
    );

    return {
      session: {
        id: session.id,
        status: session.status,
        startedAt: session.startedAt,
      },
      realtime: {
        wsUrl: `${this.downstreamConfig.getRealtimeBaseUrl()}/v1/realtime?sessionId=${session.id}`,
        token: accessToken,
      },
    };
  }

  async getSession(userId: string, sessionId: string): Promise<PublicSessionView> {
    const session = await this.getOwnedSessionRecord(userId, sessionId);
    return this.toPublicSessionView(session);
  }

  async getOwnedSessionRecord(userId: string, sessionId: string): Promise<SessionRecord> {
    return this.downstreamHttp.get<SessionRecord>(
      this.downstreamConfig.getSessionServiceBaseUrl(),
      `/sessions/${encodeURIComponent(sessionId)}?userId=${encodeURIComponent(userId)}`,
    );
  }

  async appendTurn(
    userId: string,
    sessionId: string,
    role: MessageRole,
    text: string,
  ): Promise<SessionRecord> {
    return this.downstreamHttp.post<SessionRecord>(
      this.downstreamConfig.getSessionServiceBaseUrl(),
      `/sessions/${encodeURIComponent(sessionId)}/turns`,
      {
        userId,
        role,
        text,
      },
    );
  }

  async updateAssistantState(
    userId: string,
    sessionId: string,
    state: AssistantState,
  ): Promise<SessionRecord> {
    return this.downstreamHttp.post<SessionRecord>(
      this.downstreamConfig.getSessionServiceBaseUrl(),
      `/sessions/${encodeURIComponent(sessionId)}/assistant-state`,
      {
        userId,
        state,
      },
    );
  }

  async endSession(userId: string, sessionId: string, body: EndSessionBody) {
    const session = await this.getOwnedSessionRecord(userId, sessionId);
    const profile = await this.profileService.getProfile(userId);
    const summary = await this.conversationService.buildSummary({
      session,
      profile,
    });

    return this.downstreamHttp.post<{
      id: string;
      status: SessionRecord['status'];
      endedAt?: string;
    }>(
      this.downstreamConfig.getSessionServiceBaseUrl(),
      `/sessions/${encodeURIComponent(sessionId)}/end`,
      {
        userId,
        reason: body.reason,
        summary,
      } satisfies EndOwnedSessionBody,
    );
  }

  async getSummary(userId: string, sessionId: string): Promise<SessionSummary> {
    return this.downstreamHttp.get<SessionSummary>(
      this.downstreamConfig.getSessionServiceBaseUrl(),
      `/sessions/${encodeURIComponent(sessionId)}/summary?userId=${encodeURIComponent(userId)}`,
    );
  }

  private toPublicSessionView(session: SessionRecord): PublicSessionView {
    return {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      latestAssistantState: session.latestAssistantState,
    };
  }
}
