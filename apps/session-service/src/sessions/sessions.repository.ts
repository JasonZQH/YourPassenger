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
  // Stores the Prisma client used for session persistence.
  constructor(private readonly prisma: SessionsPrismaService) {}

  // Creates an active session and returns it with ordered turns.
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

  // Loads an owned session by user and session id.
  async getSession(userId: string, sessionId: string): Promise<SessionRecord | null> {
    const session = await this.findOwnedSession(userId, sessionId);
    return session ? this.toContract(session) : null;
  }

  // Persists the latest assistant state for an owned session.
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

  // Atomically appends one turn and increments the session turn counter.
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

  // Atomically records a realtime user/assistant turn pair.
  async commitRealtimeTurn(
    userId: string,
    sessionId: string,
    transcriptText: string,
    assistantText: string,
    finalAssistantState: AssistantState,
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
            increment: 2,
          },
          latestAssistantState: finalAssistantState,
        },
        select: {
          turnCount: true,
        },
      });

      await tx.sessionTurn.createMany({
        data: [
          {
            sessionId,
            turnIndex: updatedSession.turnCount - 2,
            role: 'user',
            text: transcriptText,
          },
          {
            sessionId,
            turnIndex: updatedSession.turnCount - 1,
            role: 'assistant',
            text: assistantText,
          },
        ],
      });
    });

    if (!ownsSession) {
      return null;
    }

    return this.getSession(userId, sessionId);
  }

  // Marks a session ended and upserts its summary.
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

  // Returns the stored summary for an owned session.
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

  // Creates or updates the stored summary for an owned session.
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

  // Finds a session by id only when it belongs to the user.
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

  // Converts a Prisma session with turns into the shared session contract.
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

  // Converts a Prisma summary record into the shared summary contract.
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
