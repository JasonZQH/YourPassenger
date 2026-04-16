import { Injectable } from '@nestjs/common';

import { StoreService } from '../store/store.service';

@Injectable()
export class AuthService {
  constructor(private readonly store: StoreService) {}

  async signInWithApple(_identityToken: string) {
    const user = await this.store.signIn('apple');

    return {
      accessToken: 'dev-access-token',
      refreshToken: 'dev-refresh-token',
      user,
    };
  }

  async signInAsGuest() {
    const user = await this.store.signIn('guest');

    return {
      accessToken: 'guest-access-token',
      refreshToken: 'guest-refresh-token',
      user,
    };
  }

  async getCurrentUser() {
    return this.store.getCurrentUser();
  }
}
