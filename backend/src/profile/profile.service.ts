import { Injectable } from '@nestjs/common';

import { AuthService } from '../auth/auth.service';
import { UpdateProfileBody } from './profile.types';
import { InMemoryStoreService } from '../store/store.service';

@Injectable()
export class ProfileService {
  constructor(
    private readonly authService: AuthService,
    private readonly store: InMemoryStoreService,
  ) {}

  getProfile() {
    const user = this.authService.getCurrentUser();
    return this.store.getProfile(user.id);
  }

  updateProfile(body: UpdateProfileBody) {
    this.store.saveProfile(body);
    return {
      success: true,
      profileCompleted: true,
    };
  }
}
