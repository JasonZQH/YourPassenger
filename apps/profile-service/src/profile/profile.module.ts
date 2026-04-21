import { Module } from '@nestjs/common';

import { ProfileController } from './profile.controller';
import { ProfilePrismaService } from './profile.prisma.service';
import { ProfileReadinessProbe } from './profile.readiness';
import { ProfileRepository } from './profile.repository';
import { ProfileService } from './profile.service';

@Module({
  controllers: [ProfileController],
  providers: [
    ProfilePrismaService,
    ProfileReadinessProbe,
    ProfileRepository,
    ProfileService,
  ],
  exports: [
    ProfilePrismaService,
    ProfileReadinessProbe,
    ProfileRepository,
    ProfileService,
  ],
})
export class ProfileModule {}
