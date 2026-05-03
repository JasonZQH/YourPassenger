import { Injectable } from '@nestjs/common';

import type {
  AssistantState,
  CommitRealtimeTurnBody,
  CreateSessionBody,
  CreateOwnedSessionBody,
  EndOwnedSessionBody,
  EndSessionBody,
  SessionRecord,
  SessionSummary,
} from '@yourpassenger/contracts';

import { DownstreamConfigService } from '../http/downstream-config.service';
import { DownstreamHttpService } from '../http/downstream-http.service';
import type { CreateSessionResponse, PublicSessionView } from './sessions.types';

@Injectable()
export class SessionsService {
  constructor(
    private readonly downstreamConfig: DownstreamConfigService,
    private readonly downstreamHttp: DownstreamHttpService,
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

  async commitRealtimeTurn(
    userId: string,
    sessionId: string,
    transcriptText: string,
    assistantText: string,
    finalAssistantState: AssistantState = 'idle',
  ): Promise<SessionRecord> {
    return this.downstreamHttp.post<SessionRecord>(
      this.downstreamConfig.getSessionServiceBaseUrl(),
      `/sessions/${encodeURIComponent(sessionId)}/realtime-turn`,
      {
        userId,
        transcriptText,
        assistantText,
        finalAssistantState,
      } satisfies CommitRealtimeTurnBody,
    );
  }

  async endSession(userId: string, sessionId: string, body: EndSessionBody) {
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
