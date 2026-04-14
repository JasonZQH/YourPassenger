import { Injectable, NotFoundException } from '@nestjs/common';

import { ProfileService } from '../profile/profile.service';
import { InMemoryStoreService } from '../store/store.service';
import { ConversationOrchestratorService } from '../conversation/conversation.service';

@Injectable()
export class SessionsService {
  constructor(
    private readonly store: InMemoryStoreService,
    private readonly profileService: ProfileService,
    private readonly conversationOrchestrator: ConversationOrchestratorService,
  ) {}

  createSession() {
    const session = this.store.createSession();

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

  getSession(sessionId: string) {
    const session = this.store.getSession(sessionId);
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

  endSession(sessionId: string) {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    const summary = this.conversationOrchestrator.buildSummary(
      session,
      this.profileService.getProfile(),
    );

    const ended = this.store.endSession(sessionId, summary);
    if (!ended?.endedAt) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return {
      id: ended.id,
      status: ended.status,
      endedAt: ended.endedAt,
    };
  }

  getSummary(sessionId: string) {
    const stored = this.store.getSummary(sessionId);
    if (stored) {
      return stored;
    }

    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return this.conversationOrchestrator.buildSummary(
      session,
      this.profileService.getProfile(),
    );
  }

  appendUserTurn(sessionId: string, text: string) {
    const session = this.store.appendTurn(sessionId, 'user', text);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return session;
  }

  appendAssistantTurn(sessionId: string, text: string) {
    const session = this.store.appendTurn(sessionId, 'assistant', text);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return session;
  }

  setAssistantState(sessionId: string, state: 'idle' | 'listening' | 'thinking' | 'speaking') {
    const session = this.store.updateAssistantState(sessionId, state);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return session;
  }
}
