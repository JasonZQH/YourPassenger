import { Injectable } from '@nestjs/common';

import type {
  AssistantReply,
  BuildAssistantReplyBody,
  BuildRealtimeTurnBody,
  BuildConversationSummaryBody,
  ConversationSummary,
  RealtimeTurnResponse,
} from '@yourpassenger/contracts';

@Injectable()
export class ConversationService {
  buildAssistantReply(input: BuildAssistantReplyBody): AssistantReply {
    const utterance = input.utterance.trim();
    const nickname = input.profile?.nickname ?? 'there';
    const interestHint = input.profile?.interests[0]?.replace('_', ' ') ?? 'interesting topics';

    if (!utterance) {
      return {
        text: `I am here, ${nickname}. Bring up any topic and I will keep it short and road-friendly.`,
      };
    }

    return {
      text: `Short answer for ${nickname}: ${utterance} connects well with ${interestHint}. I can keep going or shift to a related angle if you want.`,
    };
  }

  buildRealtimeTurn(input: BuildRealtimeTurnBody): RealtimeTurnResponse {
    const transcriptText =
      input.utterance.trim() || 'Tell me something interesting for the road.';
    const nickname = input.profile?.nickname ?? 'there';
    const interestHint = input.profile?.interests[0]?.replace('_', ' ') ?? 'interesting topics';
    const lastAssistantTurn = [...input.session.turns]
      .reverse()
      .find((turn) => turn.role === 'assistant')?.text;
    const contextHint = lastAssistantTurn
      ? ` We were just talking about ${lastAssistantTurn.slice(0, 80)}.`
      : '';

    return {
      transcriptText,
      assistantText: `Short answer for ${nickname}: ${transcriptText} connects well with ${interestHint}.${contextHint} I can keep going or shift to a related angle if you want.`,
      audioFormat: 'mp3',
      audioPayload: '',
    };
  }

  buildSummary(input: BuildConversationSummaryBody): ConversationSummary {
    const topics = this.extractTopics(input.session, input.profile);
    const firstUserTurn = input.session.turns.find((turn) => turn.role === 'user')?.text;
    const summarySource =
      firstUserTurn ?? 'You completed a short MVP conversation with the AI passenger.';

    return {
      sessionId: input.session.id,
      durationSeconds: this.getDurationSeconds(input.session),
      summary: `You talked about ${summarySource.slice(0, 120)}.`,
      topics,
      memoryCandidates: [
        input.profile
          ? `User prefers a ${input.profile.conversationStyle} conversation style.`
          : 'User has not completed profile onboarding yet.',
        `Session contained ${input.session.turns.length} turns.`,
      ],
    };
  }

  private extractTopics(
    session: BuildConversationSummaryBody['session'],
    profile: BuildConversationSummaryBody['profile'],
  ): string[] {
    const explicit = profile?.interests.slice(0, 3).map((value) => value.replace('_', ' ')) ?? [];

    if (explicit.length > 0) {
      return explicit;
    }

    if (session.turns.length === 0) {
      return ['general conversation'];
    }

    return ['user-led topic'];
  }

  private getDurationSeconds(session: BuildConversationSummaryBody['session']): number {
    const startedAt = new Date(session.startedAt).getTime();
    const endedAt = new Date(session.endedAt ?? new Date().toISOString()).getTime();
    return Math.max(1, Math.round((endedAt - startedAt) / 1000));
  }
}
