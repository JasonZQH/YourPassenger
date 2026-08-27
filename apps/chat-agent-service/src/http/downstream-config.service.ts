import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DownstreamConfigService {
  // Stores service configuration used to resolve downstream URLs.
  constructor(private readonly configService: ConfigService) {}

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

  // Ensures a downstream base URL ends with the v1 API prefix.
  private withApiPrefix(baseUrl: string): string {
    const normalized = baseUrl.trim().replace(/\/$/, '');
    return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
  }
}
