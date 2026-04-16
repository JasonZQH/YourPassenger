import { Injectable } from '@nestjs/common';

import { AuthService } from '../auth/auth.service';
import { UpdateProfileBody } from './profile.types';
import { StoreService } from '../store/store.service';

@Injectable()
export class ProfileService {
  constructor(
    private readonly authService: AuthService,
    private readonly store: StoreService,
  ) {}

  async getProfile() {
    const user = await this.authService.getCurrentUser();
    return this.store.getProfile(user.id);
  }

  async updateProfile(body: UpdateProfileBody) {
    await this.store.saveProfile(body);
    return {
      success: true,
      profileCompleted: true,
    };
  }
}
