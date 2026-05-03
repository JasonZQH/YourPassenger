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
import WebSocket, { WebSocketServer } from 'ws';

import type {
  ClientRealtimeEvent,
  ServerRealtimeEvent,
} from '@yourpassenger/contracts';

import { RealtimeOrchestratorService } from './realtime.orchestrator.service';
import type { RealtimeConnectionContext } from './realtime.types';

@Injectable()
export class RealtimeGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly wsServer = new WebSocketServer({ noServer: true });
  private readonly connections = new Map<WebSocket, RealtimeConnectionContext>();
  private upgradeHandler?: (request: IncomingMessage, socket: any, head: Buffer) => void;

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly realtimeOrchestrator: RealtimeOrchestratorService,
  ) {}

  onModuleInit() {
    const httpServer = this.httpAdapterHost.httpAdapter?.getHttpServer();
    if (!httpServer) {
      throw new Error('HTTP server is not available for realtime upgrade handling.');
    }

    this.wsServer.on('connection', (socket: WebSocket, request: IncomingMessage) => {
      void this.handleConnection(socket, request);
    });

    this.upgradeHandler = (request, socket, head) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname !== '/v1/realtime') {
        return;
      }

      this.wsServer.handleUpgrade(request, socket, head, (upgradedSocket: WebSocket) => {
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

    const bufferedMessages: WebSocket.RawData[] = [];
    const bufferIncomingMessage = (data: WebSocket.RawData) => {
      bufferedMessages.push(data);
    };
    const handleSocketClose = () => {
      this.connections.delete(socket);
    };

    socket.on('message', bufferIncomingMessage);
    socket.on('close', handleSocketClose);

    try {
      const connection = await this.realtimeOrchestrator.bootstrapConnection(
        accessToken,
        sessionId,
      );

      socket.off('message', bufferIncomingMessage);
      this.connections.set(socket, connection);
      this.logger.log(`Realtime client connected for session ${sessionId}`);

      socket.on('message', (data: WebSocket.RawData) => {
        void this.handleMessage(socket, data);
      });

      this.send(socket, {
        type: 'session.ready',
        sessionId,
      });
      this.send(socket, {
        type: 'assistant.state',
        state: 'idle',
      });

      for (const bufferedMessage of bufferedMessages) {
        await this.handleMessage(socket, bufferedMessage);
      }
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
        case 'audio.commit':
        case 'assistant.interrupt':
        case 'ping': {
          const events = await this.realtimeOrchestrator.handleEvent(connection, parsed);
          for (const event of events) {
            this.send(socket, event);
          }
          break;
        }
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
