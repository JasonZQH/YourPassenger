import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../generated/prisma';

@Injectable()
export class AuthPrismaService
  extends PrismaClient
  implements OnModuleDestroy
{
  constructor(configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: configService.getOrThrow<string>('AUTH_DATABASE_URL'),
        },
      },
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
