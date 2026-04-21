import { Injectable } from '@nestjs/common';

import type { ReadinessCheck, ReadinessProbe } from '@yourpassenger/platform';

import { AuthPrismaService } from './auth.prisma.service';

@Injectable()
export class AuthReadinessProbe implements ReadinessProbe {
  constructor(private readonly prisma: AuthPrismaService) {}

  async check(): Promise<ReadinessCheck[]> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return [{ name: 'postgres', status: 'up' }];
    } catch (error) {
      return [
        {
          name: 'postgres',
          status: 'down',
          details: {
            error: error instanceof Error ? error.message : 'unknown readiness failure',
          },
        },
      ];
    }
  }
}
