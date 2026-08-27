import { Injectable } from '@nestjs/common';

import type { ReadinessCheck, ReadinessProbe } from '@yourpassenger/platform';

import { AuthPrismaService } from './auth.prisma.service';

@Injectable()
export class AuthReadinessProbe implements ReadinessProbe {
  // Stores the auth database client used for readiness checks.
  constructor(private readonly prisma: AuthPrismaService) {}

  // Checks whether the auth database can answer a simple query.
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
