import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LiveKitAgentConfigService {
  // Stores configuration used to connect chat agents to LiveKit.
  constructor(private readonly configService: ConfigService) {}

  // Reads and validates the LiveKit agent connection configuration.
  getLiveKitConfig(): {
    url: string;
    apiKey: string;
    apiSecret: string;
    agentTokenTtlSeconds: number;
  } {
    const url = this.configService.get<string>('LIVEKIT_URL')?.trim();
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY')?.trim();
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET')?.trim();

    if (!url || !apiKey || !apiSecret) {
      throw new Error(
        'LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET must be set for chat-agent-service.',
      );
    }

    return {
      url: url.replace(/\/$/, ''),
      apiKey,
      apiSecret,
      agentTokenTtlSeconds: this.getAgentTokenTtlSeconds(),
    };
  }

  // Reads and validates the LiveKit agent token TTL.
  private getAgentTokenTtlSeconds(): number {
    const configuredValue = this.configService
      .get<string>('LIVEKIT_AGENT_TOKEN_TTL_SECONDS')
      ?.trim();
    if (!configuredValue) {
      return 1800;
    }

    const parsed = Number(configuredValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error('LIVEKIT_AGENT_TOKEN_TTL_SECONDS must be a positive number.');
    }

    return parsed;
  }
}
