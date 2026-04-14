import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import {
  AuthUser,
  SessionRecord,
  SessionSummary,
  UserProfile,
} from '../common/types';

type AuthKind = 'apple' | 'guest';

@Injectable()
export class InMemoryStoreService {
  private currentUser: AuthUser | null = null;
  private readonly profiles = new Map<string, UserProfile>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly summaries = new Map<string, SessionSummary>();

  signIn(kind: AuthKind): AuthUser {
    const user: AuthUser =
      kind === 'apple'
        ? { id: 'usr_demo', nickname: 'Rider', profileCompleted: this.hasProfile('usr_demo') }
        : { id: 'guest_demo', nickname: 'Guest', profileCompleted: this.hasProfile('guest_demo') };

    this.currentUser = user;
    return user;
  }

  getCurrentUser(): AuthUser {
    if (!this.currentUser) {
      this.currentUser = {
        id: 'guest_demo',
        nickname: 'Guest',
        profileCompleted: this.hasProfile('guest_demo'),
      };
    }

    return this.currentUser;
  }

  getProfile(userId: string): UserProfile | null {
    return this.profiles.get(userId) ?? null;
  }

  saveProfile(profile: Omit<UserProfile, 'userId' | 'updatedAt'>): UserProfile {
    const user = this.getCurrentUser();
    const saved: UserProfile = {
      ...profile,
      userId: user.id,
      updatedAt: new Date().toISOString(),
    };

    this.profiles.set(user.id, saved);
    this.currentUser = {
      ...user,
      nickname: saved.nickname,
      profileCompleted: true,
    };

    return saved;
  }

  createSession(): SessionRecord {
    const session: SessionRecord = {
      id: `ses_${randomUUID()}`,
      status: 'active',
      startedAt: new Date().toISOString(),
      latestAssistantState: 'idle',
      turns: [],
    };

    this.sessions.set(session.id, session);
    return session;
  }

  getSession(sessionId: string): SessionRecord | null {
    return this.sessions.get(sessionId) ?? null;
  }

  updateAssistantState(sessionId: string, state: SessionRecord['latestAssistantState']): SessionRecord | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.latestAssistantState = state;
    return session;
  }

  appendTurn(sessionId: string, role: 'user' | 'assistant', text: string): SessionRecord | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.turns.push({
      role,
      text,
      createdAt: new Date().toISOString(),
    });

    return session;
  }

  endSession(sessionId: string, summary: SessionSummary): SessionRecord | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.status = 'ended';
    session.endedAt = new Date().toISOString();
    session.latestAssistantState = 'idle';
    this.summaries.set(sessionId, summary);

    return session;
  }

  getSummary(sessionId: string): SessionSummary | null {
    return this.summaries.get(sessionId) ?? null;
  }

  private hasProfile(userId: string): boolean {
    return this.profiles.has(userId);
  }
}
