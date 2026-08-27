import {
  Injectable,
} from '@nestjs/common';

import type {
  ClientRealtimeEvent,
  ServerRealtimeEvent,
} from '@yourpassenger/contracts';

import { AuthService } from '../auth/auth.service';
import { ConversationClientService } from '../conversation/conversation.service';
import { ProfileService } from '../profile/profile.service';
import { SessionsService } from '../sessions/sessions.service';
import type { RealtimeConnectionContext } from './realtime.types';

@Injectable()
export class RealtimeOrchestratorService {
  // Wires auth, session, profile, and conversation services for realtime turns.
  constructor(
    private readonly authService: AuthService,
    private readonly sessionsService: SessionsService,
    private readonly profileService: ProfileService,
    private readonly conversationService: ConversationClientService,
  ) {}

  // Authenticates a realtime connection and loads its initial context.
  async bootstrapConnection(
    accessToken: string,
    sessionId: string,
  ): Promise<RealtimeConnectionContext> {
    const user = await this.authService.authenticateAccessToken(accessToken);
    const session = await this.sessionsService.getOwnedSessionRecord(user.id, sessionId);
    const profile = await this.profileService.getProfile(user.id);

    return {
      userId: user.id,
      sessionId,
      profile,
      session,
    };
  }

  // Routes client realtime events into server events.
  async handleEvent(
    connection: RealtimeConnectionContext,
    event: ClientRealtimeEvent,
  ): Promise<ServerRealtimeEvent[]> {
    switch (event.type) {
      case 'audio.chunk':
        this.setLocalAssistantState(connection, 'listening');
        return [
          {
            type: 'assistant.state',
            state: 'listening',
          },
        ];
      case 'audio.commit':
        return this.handleAudioCommit(connection, event.text);
      case 'assistant.interrupt':
        this.setLocalAssistantState(connection, 'idle');
        return [
          {
            type: 'assistant.interrupted',
            messageId: `msg_${Date.now()}`,
          },
          {
            type: 'assistant.state',
            state: 'idle',
          },
        ];
      case 'ping':
        return [
          {
            type: 'pong',
            ts: event.ts ?? Date.now(),
          },
        ];
      default:
        return [
          {
            type: 'error',
            code: 'UNSUPPORTED_EVENT',
            message: `Unsupported realtime event: ${String((event as { type?: string }).type)}`,
          },
        ];
    }
  }

  // Builds, stores, and emits a realtime assistant response for committed audio.
  private async handleAudioCommit(
    connection: RealtimeConnectionContext,
    rawUtterance?: string,
  ): Promise<ServerRealtimeEvent[]> {
    this.setLocalAssistantState(connection, 'thinking');

    const realtimeTurn = await this.conversationService.buildRealtimeTurn({
      utterance: rawUtterance ?? '',
      profile: connection.profile,
      session: connection.session,
    });

    this.setLocalAssistantState(connection, 'speaking');

    connection.session = await this.sessionsService.commitRealtimeTurn(
      connection.userId,
      connection.sessionId,
      realtimeTurn.transcriptText,
      realtimeTurn.assistantText,
      'idle',
    );

    const messageId = `msg_${Date.now()}`;
    return [
      {
        type: 'transcript.final',
        utteranceId: `utt_${Date.now()}`,
        text: realtimeTurn.transcriptText,
      },
      {
        type: 'assistant.state',
        state: 'thinking',
      },
      {
        type: 'assistant.text',
        messageId,
        text: realtimeTurn.assistantText,
      },
      {
        type: 'assistant.state',
        state: 'speaking',
      },
      {
        type: 'assistant.audio',
        messageId,
        audioFormat: realtimeTurn.audioFormat,
        payload: realtimeTurn.audioPayload,
      },
      {
        type: 'assistant.state',
        state: 'idle',
      },
    ];
  }

  // Updates the in-memory session assistant state for this connection.
  private setLocalAssistantState(
    connection: RealtimeConnectionContext,
    state: 'listening' | 'thinking' | 'speaking' | 'idle',
  ) {
    connection.session = {
      ...connection.session,
      latestAssistantState: state,
    };
  }
}
