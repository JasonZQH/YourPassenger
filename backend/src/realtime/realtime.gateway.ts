import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import WebSocket, { WebSocketServer } from 'ws';

import { ConversationOrchestratorService } from '../conversation/conversation.service';
import { ProfileService } from '../profile/profile.service';
import { SessionsService } from '../sessions/sessions.service';
import {
  ClientRealtimeEvent,
  ClientTextAudioCommitEvent,
  PingEvent,
  ServerRealtimeEvent,
} from './realtime.types';

interface RealtimeConnection {
  socket: WebSocket;
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

      this.connections.set(socket, { socket, sessionId });
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
        this.handleMessage(socket, data);
      });

      socket.on('close', () => {
        this.connections.delete(socket);
      });
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

  private handleMessage(socket: WebSocket, raw: WebSocket.RawData) {
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

    switch (parsed.type) {
      case 'audio.chunk':
        this.sessionsService.setAssistantState(connection.sessionId, 'listening');
        this.send(socket, {
          type: 'assistant.state',
          state: 'listening',
        });
        break;
      case 'audio.commit':
        this.handleAudioCommit(socket, connection.sessionId, parsed);
        break;
      case 'assistant.interrupt':
        this.sessionsService.setAssistantState(connection.sessionId, 'idle');
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
  }

  private handleAudioCommit(
    socket: WebSocket,
    sessionId: string,
    event: ClientTextAudioCommitEvent,
  ) {
    const utterance = event.text?.trim() || 'Tell me something interesting for the road.';

    this.sessionsService.appendUserTurn(sessionId, utterance);
    this.sessionsService.setAssistantState(sessionId, 'thinking');

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
      profile: this.profileService.getProfile(),
    });

    this.sessionsService.appendAssistantTurn(sessionId, reply);
    this.sessionsService.setAssistantState(sessionId, 'speaking');

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

    this.sessionsService.setAssistantState(sessionId, 'idle');

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
}
