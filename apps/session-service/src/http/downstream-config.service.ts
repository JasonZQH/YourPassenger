import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DownstreamConfigService {
  constructor(private readonly configService: ConfigService) {}

  getProfileServiceBaseUrl(): string {
    return this.withApiPrefix(
      this.configService.get<string>('PROFILE_SERVICE_BASE_URL') ?? 'http://localhost:3102',
    );
  }

  getConversationServiceBaseUrl(): string {
    return this.withApiPrefix(
      this.configService.get<string>('CONVERSATION_SERVICE_BASE_URL') ?? 'http://localhost:3104',
    );
  }

  private withApiPrefix(baseUrl: string): string {
    const normalized = baseUrl.trim().replace(/\/$/, '');
    return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
  }
}
