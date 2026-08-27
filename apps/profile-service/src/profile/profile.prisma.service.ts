import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaClient } from '../generated/prisma';

@Injectable()
export class ProfilePrismaService extends PrismaClient implements OnModuleDestroy {
  // Configures Prisma with the profile service database URL.
  constructor(configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: configService.getOrThrow<string>('PROFILE_DATABASE_URL'),
        },
      },
    });
  }

  // Disconnects Prisma when the Nest module shuts down.
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
