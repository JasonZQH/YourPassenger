import { Injectable, NotFoundException } from '@nestjs/common';

import { ProfileService } from '../profile/profile.service';
import { StoreService } from '../store/store.service';
import { ConversationOrchestratorService } from '../conversation/conversation.service';

@Injectable()
export class SessionsService {
  constructor(
    private readonly store: StoreService,
    private readonly profileService: ProfileService,
    private readonly conversationOrchestrator: ConversationOrchestratorService,
  ) {}

  async createSession() {
    const session = await this.store.createSession();

    return {
      session: {
        id: session.id,
        status: session.status,
        startedAt: session.startedAt,
      },
      realtime: {
        wsUrl: `ws://localhost:${process.env.PORT ?? 3000}/v1/realtime?sessionId=${session.id}`,
        token: 'dev-realtime-token',
      },
    };
  }

  async getSession(sessionId: string) {
    const session = await this.store.getSession(sessionId);
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

  async endSession(sessionId: string) {
    const session = await this.store.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    const summary = this.conversationOrchestrator.buildSummary(
      session,
      await this.profileService.getProfile(),
    );

    const ended = await this.store.endSession(sessionId, summary);
    if (!ended?.endedAt) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return {
      id: ended.id,
      status: ended.status,
      endedAt: ended.endedAt,
    };
  }

  async getSummary(sessionId: string) {
    const stored = await this.store.getSummary(sessionId);
    if (stored) {
      return stored;
    }

    const session = await this.store.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return this.conversationOrchestrator.buildSummary(
      session,
      await this.profileService.getProfile(),
    );
  }

  async appendUserTurn(sessionId: string, text: string) {
    const session = await this.store.appendTurn(sessionId, 'user', text);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return session;
  }

  async appendAssistantTurn(sessionId: string, text: string) {
    const session = await this.store.appendTurn(sessionId, 'assistant', text);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return session;
  }

  async setAssistantState(sessionId: string, state: 'idle' | 'listening' | 'thinking' | 'speaking') {
    const session = await this.store.updateAssistantState(sessionId, state);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return session;
  }
}
