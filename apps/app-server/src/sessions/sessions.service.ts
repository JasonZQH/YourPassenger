import { Injectable } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';

import type {
  AssistantState,
  CommitRealtimeTurnBody,
  CreateSessionResponse,
  CreateSessionBody,
  CreateOwnedSessionBody,
  EndOwnedSessionBody,
  EndSessionBody,
  SessionRealtimeConnection,
  SessionRecord,
  SessionSummary,
} from '@yourpassenger/contracts';

import { DownstreamConfigService } from '../http/downstream-config.service';
import { DownstreamHttpService } from '../http/downstream-http.service';
import { ChatAgentClientService } from './chat-agent-client.service';
import type { PublicSessionView } from './sessions.types';

@Injectable()
export class SessionsService {
  // Wires downstream services and chat-agent dispatch for session creation.
  constructor(
    private readonly downstreamConfig: DownstreamConfigService,
    private readonly downstreamHttp: DownstreamHttpService,
    private readonly chatAgentClient: ChatAgentClientService,
  ) {}

  // Creates a session and returns its public session plus realtime connection.
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
      realtime: await this.buildRealtimeConnection(session.id, userId, accessToken),
    };
  }

  // Loads an owned session and maps it to the public app-server view.
  async getSession(userId: string, sessionId: string): Promise<PublicSessionView> {
    const session = await this.getOwnedSessionRecord(userId, sessionId);
    return this.toPublicSessionView(session);
  }

  // Fetches the full owned session record from the session service.
  async getOwnedSessionRecord(userId: string, sessionId: string): Promise<SessionRecord> {
    return this.downstreamHttp.get<SessionRecord>(
      this.downstreamConfig.getSessionServiceBaseUrl(),
      `/sessions/${encodeURIComponent(sessionId)}?userId=${encodeURIComponent(userId)}`,
    );
  }

  // Persists a realtime transcript and assistant reply through the session service.
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

  // Ends a session through the session service.
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

  // Fetches the summary for an owned session.
  async getSummary(userId: string, sessionId: string): Promise<SessionSummary> {
    return this.downstreamHttp.get<SessionSummary>(
      this.downstreamConfig.getSessionServiceBaseUrl(),
      `/sessions/${encodeURIComponent(sessionId)}/summary?userId=${encodeURIComponent(userId)}`,
    );
  }

  // Reduces the full session record to the public app-server session view.
  private toPublicSessionView(session: SessionRecord): PublicSessionView {
    return {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      latestAssistantState: session.latestAssistantState,
    };
  }

  // Builds either a LiveKit room connection or websocket fallback for a session.
  private async buildRealtimeConnection(
    sessionId: string,
    userId: string,
    accessToken: string,
  ): Promise<SessionRealtimeConnection> {
    const liveKitConfig = this.downstreamConfig.getLiveKitConfig();
    if (!liveKitConfig) {
      return this.buildWebSocketRealtimeConnection(sessionId, accessToken);
    }

    const roomName = this.buildLiveKitRoomName(sessionId);
    const participantToken = new AccessToken(
      liveKitConfig.apiKey,
      liveKitConfig.apiSecret,
      {
        identity: this.buildLiveKitParticipantIdentity(userId),
        metadata: JSON.stringify({
          userId,
          sessionId,
          role: 'user',
        }),
        ttl: liveKitConfig.participantTokenTtlSeconds,
      },
    );
    participantToken.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    await this.chatAgentClient.dispatchSessionAgent({
      sessionId,
      roomName,
      userId,
    });

    return {
      transport: 'livekit',
      livekitUrl: liveKitConfig.url,
      roomName,
      participantToken: await participantToken.toJwt(),
    };
  }

  // Builds the websocket realtime connection payload for fallback transport.
  private buildWebSocketRealtimeConnection(
    sessionId: string,
    accessToken: string,
  ): SessionRealtimeConnection {
    return {
      transport: 'websocket',
      wsUrl: `${this.downstreamConfig.getRealtimeBaseUrl()}/v1/realtime?sessionId=${sessionId}`,
      token: accessToken,
    };
  }

  // Builds the LiveKit room name for a session.
  private buildLiveKitRoomName(sessionId: string): string {
    return `yp_ses_${sessionId}`;
  }

  // Builds the LiveKit participant identity for an app user.
  private buildLiveKitParticipantIdentity(userId: string): string {
    return `usr_${userId}`;
  }
}
