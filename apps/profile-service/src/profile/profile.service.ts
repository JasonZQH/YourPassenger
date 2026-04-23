import { Injectable } from '@nestjs/common';

import type { UpdateProfileBody } from '@yourpassenger/contracts';

import { ProfileRepository } from './profile.repository';

@Injectable()
export class ProfileService {
  constructor(private readonly profileRepository: ProfileRepository) {}

  async getProfile(userId: string) {
    return this.profileRepository.getProfile(userId);
  }

  async getProfileCompletion(userId: string) {
    return {
      userId,
      profileCompleted: await this.profileRepository.getProfileCompletion(userId),
    };
  }

  async updateProfile(userId: string, body: UpdateProfileBody) {
    await this.profileRepository.saveProfile(userId, body);

    return {
      success: true,
      profileCompleted: true,
    };
  }
}
