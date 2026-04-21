import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaClient } from '../generated/prisma';

@Injectable()
export class SessionsPrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: configService.getOrThrow<string>('SESSION_DATABASE_URL'),
        },
      },
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
