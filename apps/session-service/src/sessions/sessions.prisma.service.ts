import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaClient } from '../generated/prisma';

@Injectable()
export class SessionsPrismaService extends PrismaClient implements OnModuleDestroy {
  // Configures Prisma with the session service database URL.
  constructor(configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: configService.getOrThrow<string>('SESSION_DATABASE_URL'),
        },
      },
    });
  }

  // Disconnects Prisma when the Nest module shuts down.
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
