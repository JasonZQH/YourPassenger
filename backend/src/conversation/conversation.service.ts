import { Injectable } from '@nestjs/common';

import { SessionRecord, SessionSummary, UserProfile } from '../common/types';

@Injectable()
export class ConversationOrchestratorService {
  buildAssistantReply(input: { utterance: string; profile: UserProfile | null }): string {
    const utterance = input.utterance.trim();
    const nickname = input.profile?.nickname ?? 'there';
    const interestHint = input.profile?.interests[0]?.replace('_', ' ') ?? 'interesting topics';

    if (!utterance) {
      return `I am here, ${nickname}. Bring up any topic and I will keep it short and road-friendly.`;
    }

    return `Short answer for ${nickname}: ${utterance} connects well with ${interestHint}. I can keep going or shift to a related angle if you want.`;
  }

  buildSummary(session: SessionRecord, profile: UserProfile | null): SessionSummary {
    const topics = this.extractTopics(session, profile);
    const firstUserTurn = session.turns.find((turn) => turn.role === 'user')?.text;
    const summary =
      firstUserTurn ??
      'You completed a short MVP conversation with the AI passenger.';

    return {
      sessionId: session.id,
      durationSeconds: this.getDurationSeconds(session),
      summary: `You talked about ${summary.slice(0, 120)}.`,
      topics,
      memoryCandidates: [
        profile
          ? `User prefers a ${profile.conversationStyle} conversation style.`
          : 'User has not completed profile onboarding yet.',
        `Session contained ${session.turns.length} turns.`,
      ],
    };
  }

  private extractTopics(session: SessionRecord, profile: UserProfile | null): string[] {
    const explicit = profile?.interests.slice(0, 3).map((value) => value.replace('_', ' ')) ?? [];

    if (explicit.length > 0) {
      return explicit;
    }

    if (session.turns.length === 0) {
      return ['general conversation'];
    }

    return ['user-led topic'];
  }

  private getDurationSeconds(session: SessionRecord): number {
    const startedAt = new Date(session.startedAt).getTime();
    const endedAt = new Date(session.endedAt ?? new Date().toISOString()).getTime();
    return Math.max(1, Math.round((endedAt - startedAt) / 1000));
  }
}
