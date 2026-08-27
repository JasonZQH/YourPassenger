import { Injectable } from '@nestjs/common';

import type { ReadinessCheck, ReadinessProbe } from '@yourpassenger/platform';

import { ProfilePrismaService } from './profile.prisma.service';

@Injectable()
export class ProfileReadinessProbe implements ReadinessProbe {
  // Stores the profile database client used for readiness checks.
  constructor(private readonly prisma: ProfilePrismaService) {}

  // Checks whether the profile database can answer a simple query.
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
