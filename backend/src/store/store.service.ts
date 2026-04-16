import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';

import {
  AuthUser,
  SessionRecord,
  SessionSummary,
  UserProfile,
} from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

type AuthKind = 'apple' | 'guest';

@Injectable()
export class StoreService {
  private currentUserId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async signIn(kind: AuthKind): Promise<AuthUser> {
    const identity =
      kind === 'apple'
        ? { userId: 'usr_demo', providerUserId: 'apple_demo', nickname: 'Rider' }
        : { userId: 'guest_demo', providerUserId: 'guest_demo', nickname: 'Guest' };

    const user = await this.prisma.user.upsert({
      where: {
        authKind_providerUserId: {
          authKind: kind,
          providerUserId: identity.providerUserId,
        },
      },
      update: {},
      create: {
        id: identity.userId,
        authKind: kind,
        providerUserId: identity.providerUserId,
        nickname: identity.nickname,
      },
    });

    this.currentUserId = user.id;
    return {
      id: user.id,
      nickname: user.nickname,
      profileCompleted: user.profileCompleted,
    };
  }

  async getCurrentUser(): Promise<AuthUser> {
    if (!this.currentUserId) {
      return this.signIn('guest');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: this.currentUserId },
    });

    if (!user) {
      this.currentUserId = null;
      return this.signIn('guest');
    }

    return {
      id: user.id,
      nickname: user.nickname,
      profileCompleted: user.profileCompleted,
    };
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return null;
    }

    return this.toUserProfile(profile);
  }

  async saveProfile(profile: Omit<UserProfile, 'userId' | 'updatedAt'>): Promise<UserProfile> {
    const user = await this.getCurrentUser();

    const savedProfile = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.userProfile.upsert({
        where: { userId: user.id },
        update: {
          nickname: profile.nickname,
          interests: [...profile.interests],
          ageRange: profile.ageRange,
          gender: profile.gender,
          occupationCategory: profile.occupationCategory,
          hobbyTags: [...profile.hobbyTags],
          preferredLanguage: profile.preferredLanguage,
          conversationStyle: profile.conversationStyle,
          responseLength: profile.responseLength,
          proactiveTopicPushing: profile.proactiveTopicPushing,
          avoidTopicTags: [...profile.avoidTopicTags],
        },
        create: {
          userId: user.id,
          nickname: profile.nickname,
          interests: [...profile.interests],
          ageRange: profile.ageRange,
          gender: profile.gender,
          occupationCategory: profile.occupationCategory,
          hobbyTags: [...profile.hobbyTags],
          preferredLanguage: profile.preferredLanguage,
          conversationStyle: profile.conversationStyle,
          responseLength: profile.responseLength,
          proactiveTopicPushing: profile.proactiveTopicPushing,
          avoidTopicTags: [...profile.avoidTopicTags],
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          nickname: profile.nickname,
          profileCompleted: true,
        },
      });

      return upserted;
    });

    return this.toUserProfile(savedProfile);
  }

  async createSession(): Promise<SessionRecord> {
    const user = await this.getCurrentUser();

    const created = await this.prisma.session.create({
      data: {
        id: `ses_${randomUUID()}`,
        userId: user.id,
      },
      include: {
        turns: {
          orderBy: { turnIndex: 'asc' },
        },
      },
    });

    return this.toSessionRecord(created);
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        turns: {
          orderBy: { turnIndex: 'asc' },
        },
      },
    });

    if (!session) {
      return null;
    }

    return this.toSessionRecord(session);
  }

  async updateAssistantState(
    sessionId: string,
    state: SessionRecord['latestAssistantState'],
  ): Promise<SessionRecord | null> {
    try {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { latestAssistantState: state },
      });
    } catch (error) {
      if (this.isRecordNotFound(error)) {
        return null;
      }

      throw error;
    }

    return this.getSession(sessionId);
  }

  async appendTurn(
    sessionId: string,
    role: 'user' | 'assistant',
    text: string,
  ): Promise<SessionRecord | null> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const updatedSession = await tx.session.update({
          where: { id: sessionId },
          data: {
            turnCount: {
              increment: 1,
            },
          },
          select: {
            turnCount: true,
          },
        });

        await tx.sessionTurn.create({
          data: {
            sessionId,
            turnIndex: updatedSession.turnCount - 1,
            role,
            text,
          },
        });
      });
    } catch (error) {
      if (this.isRecordNotFound(error) || this.isForeignKeyViolation(error)) {
        return null;
      }

      throw error;
    }

    return this.getSession(sessionId);
  }

  async endSession(sessionId: string, summary: SessionSummary): Promise<SessionRecord | null> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.session.update({
          where: { id: sessionId },
          data: {
            status: 'ended',
            endedAt: new Date(),
            latestAssistantState: 'idle',
          },
        });

        await tx.sessionSummary.upsert({
          where: { sessionId },
          update: {
            durationSeconds: summary.durationSeconds,
            summary: summary.summary,
            topics: summary.topics,
            memoryCandidates: summary.memoryCandidates,
          },
          create: {
            sessionId,
            durationSeconds: summary.durationSeconds,
            summary: summary.summary,
            topics: summary.topics,
            memoryCandidates: summary.memoryCandidates,
          },
        });
      });
    } catch (error) {
      if (this.isRecordNotFound(error)) {
        return null;
      }

      throw error;
    }

    return this.getSession(sessionId);
  }

  async getSummary(sessionId: string): Promise<SessionSummary | null> {
    const summary = await this.prisma.sessionSummary.findUnique({
      where: { sessionId },
    });

    if (!summary) {
      return null;
    }

    return {
      sessionId: summary.sessionId,
      durationSeconds: summary.durationSeconds,
      summary: summary.summary,
      topics: summary.topics,
      memoryCandidates: summary.memoryCandidates,
    };
  }

  private toUserProfile(profile: {
    userId: string;
    nickname: string;
    interests: string[];
    ageRange: string;
    gender: string;
    occupationCategory: string;
    hobbyTags: string[];
    preferredLanguage: string;
    conversationStyle: string;
    responseLength: string;
    proactiveTopicPushing: boolean;
    avoidTopicTags: string[];
    updatedAt: Date;
  }): UserProfile {
    return {
      userId: profile.userId,
      nickname: profile.nickname,
      interests: profile.interests as UserProfile['interests'],
      ageRange: profile.ageRange as UserProfile['ageRange'],
      gender: profile.gender as UserProfile['gender'],
      occupationCategory: profile.occupationCategory as UserProfile['occupationCategory'],
      hobbyTags: profile.hobbyTags as UserProfile['hobbyTags'],
      preferredLanguage: profile.preferredLanguage,
      conversationStyle: profile.conversationStyle as UserProfile['conversationStyle'],
      responseLength: profile.responseLength as UserProfile['responseLength'],
      proactiveTopicPushing: profile.proactiveTopicPushing,
      avoidTopicTags: profile.avoidTopicTags as UserProfile['avoidTopicTags'],
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  private toSessionRecord(session: {
    id: string;
    status: string;
    startedAt: Date;
    endedAt: Date | null;
    latestAssistantState: string;
    turns: Array<{
      turnIndex: number;
      role: string;
      text: string;
      createdAt: Date;
    }>;
  }): SessionRecord {
    return {
      id: session.id,
      status: session.status as SessionRecord['status'],
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString(),
      latestAssistantState: session.latestAssistantState as SessionRecord['latestAssistantState'],
      turns: session.turns.map((turn) => ({
        role: turn.role as SessionRecord['turns'][number]['role'],
        text: turn.text,
        createdAt: turn.createdAt.toISOString(),
      })),
    };
  }

  private isRecordNotFound(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    );
  }

  private isForeignKeyViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    );
  }
}
