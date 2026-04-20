import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import WebSocket, { WebSocketServer } from 'ws';

import { AuthService } from '../auth/auth.service';
import { ConversationOrchestratorService } from '../conversation/conversation.service';
import { ProfileService } from '../profile/profile.service';
import { SessionsService } from '../sessions/sessions.service';
import {
  ClientRealtimeEvent,
  ClientTextAudioCommitEvent,
  ServerRealtimeEvent,
} from './realtime.types';

interface RealtimeConnection {
  socket: WebSocket;
  userId: string;
  sessionId: string;
}

@Injectable()
export class RealtimeGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly wsServer = new WebSocketServer({ noServer: true });
  private readonly connections = new Map<WebSocket, RealtimeConnection>();
  private upgradeHandler?: (request: IncomingMessage, socket: any, head: Buffer) => void;

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly authService: AuthService,
    private readonly sessionsService: SessionsService,
    private readonly profileService: ProfileService,
    private readonly conversationOrchestrator: ConversationOrchestratorService,
  ) {}

  onModuleInit() {
    const httpServer = this.httpAdapterHost.httpAdapter?.getHttpServer();
    if (!httpServer) {
      throw new Error('HTTP server is not available for realtime upgrade handling.');
    }

    this.wsServer.on('connection', (socket, request) => {
      void this.handleConnection(socket, request);
    });

    this.upgradeHandler = (request, socket, head) => {
      const url = new URL(request.url ?? '/', 'http://localhost');

      if (url.pathname !== '/v1/realtime') {
        return;
      }

      this.wsServer.handleUpgrade(request, socket, head, (upgradedSocket) => {
        this.wsServer.emit('connection', upgradedSocket, request);
      });
    };

    httpServer.on('upgrade', this.upgradeHandler);
  }

  onModuleDestroy() {
    const httpServer = this.httpAdapterHost.httpAdapter?.getHttpServer();
    if (httpServer && this.upgradeHandler) {
      httpServer.off('upgrade', this.upgradeHandler);
    }

    for (const socket of this.connections.keys()) {
      socket.close();
    }

    this.wsServer.close();
  }

  private async handleConnection(socket: WebSocket, request: IncomingMessage) {
    const sessionId = this.extractSessionId(request);
    if (!sessionId) {
      this.send(socket, {
        type: 'error',
        code: 'SESSION_ID_REQUIRED',
        message: 'sessionId is required in the websocket query string.',
      });
      socket.close(1008, 'sessionId is required');
      return;
    }

    const accessToken = this.extractBearerToken(request.headers.authorization);
    if (!accessToken) {
      this.send(socket, {
        type: 'error',
        code: 'AUTH_REQUIRED',
        message: 'Bearer token is required for realtime.',
      });
      socket.close(1008, 'bearer token is required');
      return;
    }

    try {
      const user = await this.authService.authenticateAccessToken(accessToken);
      await this.sessionsService.getSession(user.id, sessionId);

      this.connections.set(socket, { socket, userId: user.id, sessionId });
      this.logger.log(`Realtime client connected for session ${sessionId}`);

      this.send(socket, {
        type: 'session.ready',
        sessionId,
      });

      this.send(socket, {
        type: 'assistant.state',
        state: 'idle',
      });

      socket.on('message', (data) => {
        void this.handleMessage(socket, data);
      });

      socket.on('close', () => {
        this.connections.delete(socket);
      });
    } catch (error) {
      const isUnauthorized = error instanceof UnauthorizedException;

      this.send(socket, {
        type: 'error',
        code: isUnauthorized ? 'AUTH_INVALID' : 'SESSION_NOT_FOUND',
        message: isUnauthorized
          ? 'Realtime bearer token is invalid.'
          : `Session ${sessionId} not found.`,
      });
      socket.close(1008, isUnauthorized ? 'invalid bearer token' : 'session not found');
    }
  }

  private async handleMessage(socket: WebSocket, raw: WebSocket.RawData) {
    const connection = this.connections.get(socket);
    if (!connection) {
      return;
    }

    let parsed: ClientRealtimeEvent;

    try {
      parsed = JSON.parse(raw.toString()) as ClientRealtimeEvent;
    } catch {
      this.send(socket, {
        type: 'error',
        code: 'INVALID_JSON',
        message: 'Realtime payload must be valid JSON.',
      });
      return;
    }

    try {
      switch (parsed.type) {
        case 'audio.chunk':
          await this.sessionsService.setAssistantState(
            connection.userId,
            connection.sessionId,
            'listening',
          );
          this.send(socket, {
            type: 'assistant.state',
            state: 'listening',
          });
          break;
        case 'audio.commit':
          await this.handleAudioCommit(socket, connection.userId, connection.sessionId, parsed);
          break;
        case 'assistant.interrupt':
          await this.sessionsService.setAssistantState(
            connection.userId,
            connection.sessionId,
            'idle',
          );
          this.send(socket, {
            type: 'assistant.interrupted',
            messageId: `msg_${Date.now()}`,
          });
          this.send(socket, {
            type: 'assistant.state',
            state: 'idle',
          });
          break;
        case 'ping':
          this.send(socket, {
            type: 'pong',
            ts: parsed.ts ?? Date.now(),
          });
          break;
        default:
          this.send(socket, {
            type: 'error',
            code: 'UNSUPPORTED_EVENT',
            message: `Unsupported realtime event: ${String((parsed as { type?: string }).type)}`,
          });
      }
    } catch (error) {
      const isNotFound = error instanceof NotFoundException;
      this.logger.error(
        `Realtime event handling failed for session ${connection.sessionId}`,
        error instanceof Error ? error.stack : undefined,
      );

      this.send(socket, {
        type: 'error',
        code: isNotFound ? 'SESSION_NOT_FOUND' : 'SERVER_ERROR',
        message: isNotFound
          ? `Session ${connection.sessionId} not found.`
          : 'Realtime processing failed.',
      });
    }
  }

  private async handleAudioCommit(
    socket: WebSocket,
    userId: string,
    sessionId: string,
    event: ClientTextAudioCommitEvent,
  ) {
    const utterance = event.text?.trim() || 'Tell me something interesting for the road.';

    await this.sessionsService.appendUserTurn(userId, sessionId, utterance);
    await this.sessionsService.setAssistantState(userId, sessionId, 'thinking');

    this.send(socket, {
      type: 'transcript.final',
      utteranceId: `utt_${Date.now()}`,
      text: utterance,
    });

    this.send(socket, {
      type: 'assistant.state',
      state: 'thinking',
    });

    const reply = this.conversationOrchestrator.buildAssistantReply({
      utterance,
      profile: await this.profileService.getProfile(userId),
    });

    await this.sessionsService.appendAssistantTurn(userId, sessionId, reply);
    await this.sessionsService.setAssistantState(userId, sessionId, 'speaking');

    this.send(socket, {
      type: 'assistant.text',
      messageId: `msg_${Date.now()}`,
      text: reply,
    });

    this.send(socket, {
      type: 'assistant.state',
      state: 'speaking',
    });

    this.send(socket, {
      type: 'assistant.audio',
      messageId: `msg_${Date.now()}`,
      audioFormat: 'mp3',
      payload: '',
    });

    await this.sessionsService.setAssistantState(userId, sessionId, 'idle');

    this.send(socket, {
      type: 'assistant.state',
      state: 'idle',
    });
  }

  private send(socket: WebSocket, event: ServerRealtimeEvent) {
    socket.send(JSON.stringify(event));
  }

  private extractSessionId(request: IncomingMessage): string | null {
    const url = new URL(request.url ?? '/', 'http://localhost');
    return url.searchParams.get('sessionId');
  }

  private extractBearerToken(authorizationHeader?: string | string[]): string | null {
    const headerValue = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]
      : authorizationHeader;
    if (!headerValue) {
      return null;
    }

    const [scheme, token] = headerValue.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    return token;
  }
}
