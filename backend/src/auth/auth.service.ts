import { Injectable } from '@nestjs/common';

import { InMemoryStoreService } from '../store/store.service';

@Injectable()
export class AuthService {
  constructor(private readonly store: InMemoryStoreService) {}

  signInWithApple(_identityToken: string) {
    const user = this.store.signIn('apple');

    return {
      accessToken: 'dev-access-token',
      refreshToken: 'dev-refresh-token',
      user,
    };
  }

  signInAsGuest() {
    const user = this.store.signIn('guest');

    return {
      accessToken: 'guest-access-token',
      refreshToken: 'guest-refresh-token',
      user,
    };
  }

  getCurrentUser() {
    return this.store.getCurrentUser();
  }
}
