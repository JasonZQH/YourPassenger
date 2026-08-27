import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DownstreamConfigService {
  // Stores application configuration used to resolve downstream services.
  constructor(private readonly configService: ConfigService) {}

  // Returns the auth service base URL with the API prefix applied.
  getAuthServiceBaseUrl(): string {
    return this.withApiPrefix(
      this.configService.get<string>('AUTH_SERVICE_BASE_URL') ?? 'http://localhost:3101',
    );
  }

  // Returns the profile service base URL with the API prefix applied.
  getProfileServiceBaseUrl(): string {
    return this.withApiPrefix(
      this.configService.get<string>('PROFILE_SERVICE_BASE_URL') ?? 'http://localhost:3102',
    );
  }

  // Returns the session service base URL with the API prefix applied.
  getSessionServiceBaseUrl(): string {
    return this.withApiPrefix(
      this.configService.get<string>('SESSION_SERVICE_BASE_URL') ?? 'http://localhost:3103',
    );
  }

  // Returns the conversation service base URL with the API prefix applied.
  getConversationServiceBaseUrl(): string {
    return this.withApiPrefix(
      this.configService.get<string>('CONVERSATION_SERVICE_BASE_URL') ?? 'http://localhost:3104',
    );
  }

  // Returns the chat-agent service base URL with the API prefix applied.
  getChatAgentServiceBaseUrl(): string {
    return this.withApiPrefix(
      this.configService.get<string>('CHAT_AGENT_SERVICE_BASE_URL') ?? 'http://localhost:3105',
    );
  }

  // Returns the gRPC endpoint used for the conversation hot path.
  getConversationServiceGrpcUrl(): string {
    return this.configService.get<string>('CONVERSATION_SERVICE_GRPC_URL') ?? 'localhost:5104';
  }

  // Returns the public websocket base URL exposed to clients.
  getRealtimeBaseUrl(): string {
    const configuredBaseUrl = this.configService.get<string>('PUBLIC_WS_BASE_URL')?.trim();
    if (configuredBaseUrl) {
      return configuredBaseUrl.replace(/\/$/, '');
    }

    const port = Number(
      this.configService.get<string>('APP_SERVER_PORT') ??
        this.configService.get<string>('PORT') ??
        '3000',
    );
    return `ws://localhost:${port}`;
  }

  // Returns LiveKit configuration when realtime rooms are enabled.
  getLiveKitConfig():
    | {
        url: string;
        apiKey: string;
        apiSecret: string;
        participantTokenTtlSeconds: number;
      }
    | null {
    const url = this.configService.get<string>('LIVEKIT_URL')?.trim();
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY')?.trim();
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET')?.trim();

    if (!url && !apiKey && !apiSecret) {
      return null;
    }

    if (!url || !apiKey || !apiSecret) {
      throw new Error(
        'LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET must all be set to enable LiveKit realtime.',
      );
    }

    return {
      url: url.replace(/\/$/, ''),
      apiKey,
      apiSecret,
      participantTokenTtlSeconds: this.getLiveKitParticipantTokenTtlSeconds(),
    };
  }

  // Reads and validates the LiveKit participant token TTL.
  private getLiveKitParticipantTokenTtlSeconds(): number {
    const configuredValue = this.configService
      .get<string>('LIVEKIT_PARTICIPANT_TOKEN_TTL_SECONDS')
      ?.trim();
    if (!configuredValue) {
      return 1800;
    }

    const parsed = Number(configuredValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error('LIVEKIT_PARTICIPANT_TOKEN_TTL_SECONDS must be a positive number.');
    }

    return parsed;
  }

  // Ensures a downstream base URL ends with the v1 API prefix.
  private withApiPrefix(baseUrl: string): string {
    const normalized = baseUrl.trim().replace(/\/$/, '');
    return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
  }
}
