import { createHash, randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  AuthUser,
  SessionRecord,
  SessionSummary,
  UserProfile,
} from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StoreService {
  constructor(private readonly prisma: PrismaService) {}

  async signInWithApple(identityToken: string): Promise<AuthUser> {
    const providerUserId = this.hashAppleIdentityToken(identityToken);
    const user = await this.prisma.user.upsert({
      where: {
        authKind_providerUserId: {
          authKind: 'apple',
          providerUserId,
        },
      },
      update: {},
      create: {
        id: `usr_${randomUUID()}`,
        authKind: 'apple',
        providerUserId,
        nickname: 'Rider',
      },
    });

    return this.toAuthUser(user);
  }

  async createGuestUser(): Promise<AuthUser> {
    const user = await this.prisma.user.create({
      data: {
        id: `usr_${randomUUID()}`,
        authKind: 'guest',
        providerUserId: `guest_${randomUUID()}`,
        nickname: 'Guest',
      },
    });

    return this.toAuthUser(user);
  }

  async getUser(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      return null;
    }

    return this.toAuthUser(user);
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

  async saveProfile(
    userId: string,
    profile: Omit<UserProfile, 'userId' | 'updatedAt'>,
  ): Promise<UserProfile> {
    const savedProfile = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.userProfile.upsert({
        where: { userId },
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
          userId,
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
        where: { id: userId },
        data: {
          nickname: profile.nickname,
          profileCompleted: true,
        },
      });

      return upserted;
    });

    return this.toUserProfile(savedProfile);
  }

  async createSession(userId: string): Promise<SessionRecord> {
    const created = await this.prisma.session.create({
      data: {
        id: `ses_${randomUUID()}`,
        userId,
      },
      include: {
        turns: {
          orderBy: { turnIndex: 'asc' },
        },
      },
    });

    return this.toSessionRecord(created);
  }

  async getSession(userId: string, sessionId: string): Promise<SessionRecord | null> {
    const session = await this.findOwnedSession(userId, sessionId);
    if (!session) {
      return null;
    }

    return this.toSessionRecord(session);
  }

  async updateAssistantState(
    userId: string,
    sessionId: string,
    state: SessionRecord['latestAssistantState'],
  ): Promise<SessionRecord | null> {
    const ownedSession = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: { id: true },
    });
    if (!ownedSession) {
      return null;
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { latestAssistantState: state },
    });

    return this.getSession(userId, sessionId);
  }

  async appendTurn(
    userId: string,
    sessionId: string,
    role: 'user' | 'assistant',
    text: string,
  ): Promise<SessionRecord | null> {
    let ownsSession = true;

    try {
      await this.prisma.$transaction(async (tx) => {
        const ownedSession = await tx.session.findFirst({
          where: {
            id: sessionId,
            userId,
          },
          select: { id: true },
        });
        if (!ownedSession) {
          ownsSession = false;
          return;
        }

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
      if (this.isForeignKeyViolation(error)) {
        return null;
      }

      throw error;
    }

    if (!ownsSession) {
      return null;
    }

    return this.getSession(userId, sessionId);
  }

  async endSession(
    userId: string,
    sessionId: string,
    summary: SessionSummary,
  ): Promise<SessionRecord | null> {
    let ownsSession = true;

    await this.prisma.$transaction(async (tx) => {
      const ownedSession = await tx.session.findFirst({
        where: {
          id: sessionId,
          userId,
        },
        select: { id: true },
      });
      if (!ownedSession) {
        ownsSession = false;
        return;
      }

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

    if (!ownsSession) {
      return null;
    }

    return this.getSession(userId, sessionId);
  }

  async getSummary(userId: string, sessionId: string): Promise<SessionSummary | null> {
    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: { id: true },
    });
    if (!session) {
      return null;
    }

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

  private async findOwnedSession(userId: string, sessionId: string) {
    return this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      include: {
        turns: {
          orderBy: { turnIndex: 'asc' },
        },
      },
    });
  }

  private hashAppleIdentityToken(identityToken: string): string {
    const jwtPayload = identityToken.split('.')[1];
    if (jwtPayload) {
      try {
        const parsedPayload = JSON.parse(
          Buffer.from(jwtPayload, 'base64url').toString('utf8'),
        ) as { sub?: string };
        if (parsedPayload.sub) {
          return parsedPayload.sub;
        }
      } catch {
        // Fall through to hashing the opaque token for local mock flows.
      }
    }

    return createHash('sha256').update(identityToken).digest('hex');
  }

  private toAuthUser(user: {
    id: string;
    nickname: string;
    profileCompleted: boolean;
  }): AuthUser {
    return {
      id: user.id,
      nickname: user.nickname,
      profileCompleted: user.profileCompleted,
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

  private isForeignKeyViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    );
  }
}
