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
  // Builds a non-realtime assistant reply from a text utterance and profile.
  async buildAssistantReply(input: BuildAssistantReplyBody): Promise<AssistantReply> {
    const utterance = input.utterance.trim();
    if (this.openAiEnabled()) {
      return {
        text: await this.buildOpenAiReply({
          utterance,
          profile: input.profile,
          session: null,
        }),
      };
    }

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

  // Builds the transcript and assistant response for one realtime turn.
  async buildRealtimeTurn(input: BuildRealtimeTurnBody): Promise<RealtimeTurnResponse> {
    const transcriptText =
      input.utterance.trim() || 'Tell me something interesting for the road.';

    console.log(
      '[conversation] realtime turn received',
      `provider=${this.openAiEnabled() ? 'openai' : process.env.LLM_PROVIDER ?? 'mock'}`,
      `utterance="${this.formatLogText(transcriptText)}"`,
    );

    if (this.openAiEnabled()) {
      const assistantText = await this.buildOpenAiReply({
        utterance: transcriptText,
        profile: input.profile,
        session: input.session,
      });
      console.log(
        '[conversation] assistant reply',
        'source=openai',
        `text="${this.formatLogText(assistantText)}"`,
      );
      return {
        transcriptText,
        assistantText,
        audioFormat: 'mp3',
        audioPayload: '',
      };
    }

    const nickname = input.profile?.nickname ?? 'there';
    const interestHint = input.profile?.interests[0]?.replace('_', ' ') ?? 'interesting topics';
    const lastAssistantTurn = [...input.session.turns]
      .reverse()
      .find((turn) => turn.role === 'assistant')?.text;
    const contextHint = lastAssistantTurn
      ? ` We were just talking about ${lastAssistantTurn.slice(0, 80)}.`
      : '';

    const assistantText = `Short answer for ${nickname}: ${transcriptText} connects well with ${interestHint}.${contextHint} I can keep going or shift to a related angle if you want.`;
    console.log(
      '[conversation] assistant reply',
      'source=mock',
      `text="${this.formatLogText(assistantText)}"`,
    );

    return {
      transcriptText,
      assistantText,
      audioFormat: 'mp3',
      audioPayload: '',
    };
  }

  // Produces a compact summary and memory candidates for a completed session.
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

  // Chooses summary topics from profile interests or session activity.
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

  // Calculates elapsed session time in seconds.
  private getDurationSeconds(session: BuildConversationSummaryBody['session']): number {
    const startedAt = new Date(session.startedAt).getTime();
    const endedAt = new Date(session.endedAt ?? new Date().toISOString()).getTime();
    return Math.max(1, Math.round((endedAt - startedAt) / 1000));
  }

  // Returns whether OpenAI LLM generation is configured for this service.
  private openAiEnabled(): boolean {
    return (
      process.env.LLM_PROVIDER === 'openai' &&
      !!this.getOpenAiApiKey()
    );
  }

  // Calls OpenAI to produce a spoken-friendly assistant reply.
  private async buildOpenAiReply(input: {
    utterance: string;
    profile: BuildRealtimeTurnBody['profile'];
    session: BuildRealtimeTurnBody['session'] | null;
  }): Promise<string> {
    const apiKey = this.getOpenAiApiKey();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_LLM_MODEL || 'gpt-4.1-mini',
        temperature: 0.7,
        max_tokens: 220,
        messages: this.buildOpenAiMessages(input),
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message?: string };
        }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error?.message ?? `OpenAI LLM request failed with ${response.status}.`);
    }

    const text = payload?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error('OpenAI LLM response did not include assistant text.');
    }

    return text;
  }

  // Builds the OpenAI chat message list from profile and session context.
  private buildOpenAiMessages(input: {
    utterance: string;
    profile: BuildRealtimeTurnBody['profile'];
    session: BuildRealtimeTurnBody['session'] | null;
  }) {
    const profileFacts = input.profile
      ? [
          `Nickname: ${input.profile.nickname}`,
          `Preferred language: ${input.profile.preferredLanguage}`,
          `Conversation style: ${input.profile.conversationStyle}`,
          `Response length: ${input.profile.responseLength}`,
          `Interests: ${input.profile.interests.join(', ') || 'none'}`,
          `Hobbies: ${input.profile.hobbyTags.join(', ') || 'none'}`,
          `Avoid topics: ${input.profile.avoidTopicTags.join(', ') || 'none'}`,
        ].join('\n')
      : 'No completed profile is available yet.';

    const recentTurns = input.session
      ? input.session.turns
          .slice(-8)
          .map((turn) => `${turn.role}: ${turn.text}`)
          .join('\n')
      : '';

    return [
      {
        role: 'system',
        content:
          'You are Passenger, a concise voice companion for a mobile app. Answer naturally for spoken conversation. Keep replies short, useful, and easy to listen to while traveling. Do not mention implementation details.',
      },
      {
        role: 'system',
        content: `User context:\n${profileFacts}`,
      },
      ...(recentTurns
        ? [
            {
              role: 'system',
              content: `Recent session turns:\n${recentTurns}`,
            },
          ]
        : []),
      {
        role: 'user',
        content: input.utterance,
      },
    ];
  }

  // Returns a usable OpenAI API key when one is configured.
  private getOpenAiApiKey(): string | null {
    const value = process.env.OPENAI_API_KEY?.trim();
    if (!value || value === 'replace-with-openai-api-key') {
      return null;
    }
    return value;
  }

  // Sanitizes long text for concise terminal logging.
  private formatLogText(text: string): string {
    // Transcripts are user speech. Redact them unless LOG_TRANSCRIPTS=1 so a
    // deployed service never writes what a driver said into its logs.
    if (process.env.LOG_TRANSCRIPTS !== '1') {
      return `<${text.length} chars>`;
    }
    return text
      .replace(/\s+/g, ' ')
      .replace(/"/g, '\\"')
      .slice(0, 240);
  }
}
