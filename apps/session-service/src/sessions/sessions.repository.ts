import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';

import type {
  AssistantState,
  MessageRole,
  SessionRecord,
  SessionSummary,
} from '@yourpassenger/contracts';
import type {
  Session as SessionModel,
  SessionSummary as SessionSummaryModel,
  SessionTurn as SessionTurnModel,
} from '../generated/prisma';

import { SessionsPrismaService } from './sessions.prisma.service';

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: SessionsPrismaService) {}

  async createSession(userId: string): Promise<SessionRecord> {
    const session = await this.prisma.session.create({
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

    return this.toContract(session);
  }

  async getSession(userId: string, sessionId: string): Promise<SessionRecord | null> {
    const session = await this.findOwnedSession(userId, sessionId);
    return session ? this.toContract(session) : null;
  }

  async updateAssistantState(
    userId: string,
    sessionId: string,
    state: AssistantState,
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
    role: MessageRole,
    text: string,
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
          topics: [...summary.topics],
          memoryCandidates: [...summary.memoryCandidates],
        },
        create: {
          sessionId,
          durationSeconds: summary.durationSeconds,
          summary: summary.summary,
          topics: [...summary.topics],
          memoryCandidates: [...summary.memoryCandidates],
        },
      });
    });

    if (!ownsSession) {
      return null;
    }

    return this.getSession(userId, sessionId);
  }

  async getSummary(userId: string, sessionId: string): Promise<SessionSummary | null> {
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

    const summary = await this.prisma.sessionSummary.findUnique({
      where: { sessionId },
    });
    return summary ? this.toSummary(summary) : null;
  }

  async upsertSummary(
    userId: string,
    sessionId: string,
    summary: SessionSummary,
  ): Promise<SessionSummary | null> {
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

    const stored = await this.prisma.sessionSummary.upsert({
      where: { sessionId },
      update: {
        durationSeconds: summary.durationSeconds,
        summary: summary.summary,
        topics: [...summary.topics],
        memoryCandidates: [...summary.memoryCandidates],
      },
      create: {
        sessionId,
        durationSeconds: summary.durationSeconds,
        summary: summary.summary,
        topics: [...summary.topics],
        memoryCandidates: [...summary.memoryCandidates],
      },
    });

    return this.toSummary(stored);
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

  private toContract(
    session: SessionModel & {
      turns: SessionTurnModel[];
    },
  ): SessionRecord {
    return {
      id: session.id,
      status: session.status as SessionRecord['status'],
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString(),
      latestAssistantState:
        session.latestAssistantState as SessionRecord['latestAssistantState'],
      turns: session.turns.map((turn) => ({
        role: turn.role as SessionRecord['turns'][number]['role'],
        text: turn.text,
        createdAt: turn.createdAt.toISOString(),
      })),
    };
  }

  private toSummary(summary: SessionSummaryModel): SessionSummary {
    return {
      sessionId: summary.sessionId,
      durationSeconds: summary.durationSeconds,
      summary: summary.summary,
      topics: [...summary.topics],
      memoryCandidates: [...summary.memoryCandidates],
    };
  }
}
