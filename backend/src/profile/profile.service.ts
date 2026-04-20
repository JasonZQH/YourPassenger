import { Injectable } from '@nestjs/common';

import { UpdateProfileBody } from './profile.types';
import { StoreService } from '../store/store.service';

@Injectable()
export class ProfileService {
  constructor(private readonly store: StoreService) {}

  async getProfile(userId: string) {
    return this.store.getProfile(userId);
  }

  async updateProfile(userId: string, body: UpdateProfileBody) {
    await this.store.saveProfile(userId, body);
    return {
      success: true,
      profileCompleted: true,
    };
  }
}
