import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type {
  AppendSessionTurnBody,
  CommitRealtimeTurnBody,
  CreateOwnedSessionBody,
  EndOwnedSessionBody,
  SessionRecord,
  SessionSummary,
  SessionSummaryInput,
  UpdateAssistantStateBody,
  UpsertSessionSummaryBody,
} from '@yourpassenger/contracts';

import { ConversationClientService } from '../conversation/conversation-client.service';
import { ProfileClientService } from '../profile/profile-client.service';
import { SessionsRepository } from './sessions.repository';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly profileClientService: ProfileClientService,
    private readonly conversationClientService: ConversationClientService,
  ) {}

  async createSession(body: CreateOwnedSessionBody): Promise<SessionRecord> {
    return this.sessionsRepository.createSession(body.userId);
  }

  async getSession(userId: string, sessionId: string): Promise<SessionRecord> {
    const session = await this.sessionsRepository.getSession(userId, sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return session;
  }

  async endSession(sessionId: string, body: EndOwnedSessionBody) {
    const session = await this.sessionsRepository.getSession(body.userId, sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    const summary = this.withSessionId(
      sessionId,
      body.summary ?? (await this.buildSummaryInput(body.userId, session)),
    );
    const ended = await this.sessionsRepository.endSession(body.userId, sessionId, summary);
    if (!ended?.endedAt) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return {
      id: ended.id,
      status: ended.status,
      endedAt: ended.endedAt,
    };
  }

  async getSummary(userId: string, sessionId: string): Promise<SessionSummary> {
    const stored = await this.sessionsRepository.getSummary(userId, sessionId);
    if (stored) {
      return stored;
    }

    const session = await this.sessionsRepository.getSession(userId, sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    const generatedSummary = this.withSessionId(
      sessionId,
      this.buildFallbackSummary(session),
    );
    await this.sessionsRepository.upsertSummary(userId, sessionId, generatedSummary);
    return generatedSummary;
  }

  async appendTurn(
    sessionId: string,
    body: AppendSessionTurnBody,
  ): Promise<SessionRecord> {
    const session = await this.sessionsRepository.appendTurn(
      body.userId,
      sessionId,
      body.role,
      body.text,
    );
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return session;
  }

  async commitRealtimeTurn(
    sessionId: string,
    body: CommitRealtimeTurnBody,
  ): Promise<SessionRecord> {
    const session = await this.sessionsRepository.commitRealtimeTurn(
      body.userId,
      sessionId,
      body.transcriptText,
      body.assistantText,
      body.finalAssistantState ?? 'idle',
    );
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return session;
  }

  async updateAssistantState(
    sessionId: string,
    body: UpdateAssistantStateBody,
  ): Promise<SessionRecord> {
    const session = await this.sessionsRepository.updateAssistantState(
      body.userId,
      sessionId,
      body.state,
    );
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return session;
  }

  async upsertSummary(
    sessionId: string,
    body: UpsertSessionSummaryBody,
  ): Promise<SessionSummary> {
    const summary = await this.sessionsRepository.upsertSummary(
      body.userId,
      sessionId,
      this.withSessionId(sessionId, body),
    );
    if (!summary) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    return summary;
  }

  private withSessionId(
    sessionId: string,
    summary: SessionSummaryInput,
  ): SessionSummary {
    return {
      sessionId,
      durationSeconds: summary.durationSeconds,
      summary: summary.summary,
      topics: [...summary.topics],
      memoryCandidates: [...summary.memoryCandidates],
    };
  }

  private buildFallbackSummary(session: SessionRecord): SessionSummaryInput {
    const firstUserTurn = session.turns.find((turn) => turn.role === 'user')?.text?.trim();
    const summarySource =
      firstUserTurn || 'a short MVP conversation with the AI passenger';

    return {
      durationSeconds: this.getDurationSeconds(session),
      summary: `You talked about ${summarySource.slice(0, 120)}.`,
      topics: session.turns.length === 0 ? ['general conversation'] : ['user-led topic'],
      memoryCandidates: [`Session contained ${session.turns.length} turns.`],
    };
  }

  private async buildSummaryInput(
    userId: string,
    session: SessionRecord,
  ): Promise<SessionSummaryInput> {
    try {
      const profile = await this.profileClientService.getProfile(userId);
      return await this.conversationClientService.buildSummary({
        session,
        profile,
      });
    } catch (error) {
      this.logger.warn(
        `Falling back to local summary generation for session ${session.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.buildFallbackSummary(session);
    }
  }

  private getDurationSeconds(session: SessionRecord): number {
    const startedAt = new Date(session.startedAt).getTime();
    const endedAt = new Date(session.endedAt ?? new Date().toISOString()).getTime();
    return Math.max(1, Math.round((endedAt - startedAt) / 1000));
  }
}
