import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../generated/prisma';

@Injectable()
export class AuthPrismaService
  extends PrismaClient
  implements OnModuleDestroy
{
  // Configures Prisma with the auth service database URL.
  constructor(configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: configService.getOrThrow<string>('AUTH_DATABASE_URL'),
        },
      },
    });
  }

  // Disconnects Prisma when the Nest module shuts down.
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
