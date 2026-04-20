import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ProfileService } from '../profile/profile.service';
import { StoreService } from '../store/store.service';
import { ConversationOrchestratorService } from '../conversation/conversation.service';

@Injectable()
export class SessionsService {
  constructor(
    private readonly store: StoreService,
    private readonly profileService: ProfileService,
    private readonly conversationOrchestrator: ConversationOrchestratorService,
    private readonly configService: ConfigService,
  ) {}

  async createSession(userId: string, realtimeToken: string) {
    const session = await this.store.createSession(userId);

    return {
      session: {
        id: session.id,
        status: session.status,
        startedAt: session.startedAt,
      },
      realtime: {
        wsUrl: `${this.getRealtimeBaseUrl()}/v1/realtime?sessionId=${session.id}`,
        token: realtimeToken,
      },
    };
  }

  async getSession(userId: string, sessionId: string) {
    const session = await this.store.getSession(userId, sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      latestAssistantState: session.latestAssistantState,
    };
  }

  async endSession(userId: string, sessionId: string) {
    const session = await this.store.getSession(userId, sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    const summary = this.conversationOrchestrator.buildSummary(
      session,
      await this.profileService.getProfile(userId),
    );

    const ended = await this.store.endSession(userId, sessionId, summary);
    if (!ended?.endedAt) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return {
      id: ended.id,
      status: ended.status,
      endedAt: ended.endedAt,
    };
  }

  async getSummary(userId: string, sessionId: string) {
    const stored = await this.store.getSummary(userId, sessionId);
    if (stored) {
      return stored;
    }

    const session = await this.store.getSession(userId, sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return this.conversationOrchestrator.buildSummary(
      session,
      await this.profileService.getProfile(userId),
    );
  }

  async appendUserTurn(userId: string, sessionId: string, text: string) {
    const session = await this.store.appendTurn(userId, sessionId, 'user', text);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return session;
  }

  async appendAssistantTurn(userId: string, sessionId: string, text: string) {
    const session = await this.store.appendTurn(userId, sessionId, 'assistant', text);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return session;
  }

  async setAssistantState(
    userId: string,
    sessionId: string,
    state: 'idle' | 'listening' | 'thinking' | 'speaking',
  ) {
    const session = await this.store.updateAssistantState(userId, sessionId, state);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return session;
  }

  private getRealtimeBaseUrl(): string {
    const configuredBaseUrl = this.configService.get<string>('PUBLIC_WS_BASE_URL')?.trim();
    if (configuredBaseUrl) {
      return configuredBaseUrl.replace(/\/$/, '');
    }

    const port = Number(this.configService.get<string>('PORT') ?? '3000');
    return `ws://localhost:${port}`;
  }
}
