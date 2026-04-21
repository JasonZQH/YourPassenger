import { createHash, randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';

import type { CurrentUserView } from '@yourpassenger/contracts';

import type { AuthIdentity } from '../generated/prisma';
import { AuthPrismaService } from './auth.prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: AuthPrismaService) {}

  async signInWithApple(identityToken: string): Promise<CurrentUserView> {
    const providerUserId = this.hashAppleIdentityToken(identityToken);
    const identity = await this.prisma.authIdentity.upsert({
      where: {
        authKind_providerUserId: {
          authKind: 'apple',
          providerUserId,
        },
      },
      update: {},
      create: {
        id: `usr_${randomUUID()}`,
        authKind: 'apple',
        providerUserId,
        nickname: 'Rider',
        profileCompleted: false,
      },
    });

    return this.toCurrentUserView(identity);
  }

  async createGuestUser(): Promise<CurrentUserView> {
    const identity = await this.prisma.authIdentity.create({
      data: {
        id: `usr_${randomUUID()}`,
        authKind: 'guest',
        providerUserId: `guest_${randomUUID()}`,
        nickname: 'Guest',
        profileCompleted: false,
      },
    });

    return this.toCurrentUserView(identity);
  }

  async getCurrentUser(userId: string): Promise<CurrentUserView | null> {
    const identity = await this.prisma.authIdentity.findUnique({
      where: { id: userId },
    });
    if (!identity) {
      return null;
    }

    return this.toCurrentUserView(identity);
  }

  private hashAppleIdentityToken(identityToken: string): string {
    return createHash('sha256').update(identityToken).digest('hex');
  }

  private toCurrentUserView(identity: AuthIdentity): CurrentUserView {
    return {
      id: identity.id,
      nickname: identity.nickname,
      profileCompleted: identity.profileCompleted,
    };
  }
}
