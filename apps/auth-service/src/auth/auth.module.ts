import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthPrismaService } from './auth.prisma.service';
import { AuthReadinessProbe } from './auth.readiness';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthPrismaService, AuthReadinessProbe, AuthRepository, AuthService],
  exports: [AuthPrismaService, AuthReadinessProbe, AuthRepository, AuthService],
})
export class AuthModule {}
