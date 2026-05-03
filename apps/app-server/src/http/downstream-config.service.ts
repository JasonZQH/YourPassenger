import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DownstreamConfigService {
  constructor(private readonly configService: ConfigService) {}

  getAuthServiceBaseUrl(): string {
    return this.withApiPrefix(
      this.configService.get<string>('AUTH_SERVICE_BASE_URL') ?? 'http://localhost:3101',
    );
  }

  getProfileServiceBaseUrl(): string {
    return this.withApiPrefix(
      this.configService.get<string>('PROFILE_SERVICE_BASE_URL') ?? 'http://localhost:3102',
    );
  }

  getSessionServiceBaseUrl(): string {
    return this.withApiPrefix(
      this.configService.get<string>('SESSION_SERVICE_BASE_URL') ?? 'http://localhost:3103',
    );
  }

  getConversationServiceBaseUrl(): string {
    return this.withApiPrefix(
      this.configService.get<string>('CONVERSATION_SERVICE_BASE_URL') ?? 'http://localhost:3104',
    );
  }

  getConversationServiceGrpcUrl(): string {
    return this.configService.get<string>('CONVERSATION_SERVICE_GRPC_URL') ?? 'localhost:5104';
  }

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

  private withApiPrefix(baseUrl: string): string {
    const normalized = baseUrl.trim().replace(/\/$/, '');
    return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
  }
}
