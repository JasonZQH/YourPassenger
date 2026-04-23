import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaClient } from '../generated/prisma';

@Injectable()
export class ProfilePrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: configService.getOrThrow<string>('PROFILE_DATABASE_URL'),
        },
      },
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
