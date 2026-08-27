import { Injectable } from '@nestjs/common';

import type { UpdateProfileBody } from '@yourpassenger/contracts';

import { ProfileRepository } from './profile.repository';

@Injectable()
export class ProfileService {
  // Stores the repository that owns profile persistence.
  constructor(private readonly profileRepository: ProfileRepository) {}

  // Returns a user's saved profile when one exists.
  async getProfile(userId: string) {
    return this.profileRepository.getProfile(userId);
  }

  // Reports whether the user has completed profile onboarding.
  async getProfileCompletion(userId: string) {
    return {
      userId,
      profileCompleted: await this.profileRepository.getProfileCompletion(userId),
    };
  }

  // Saves profile fields and returns the completion status.
  async updateProfile(userId: string, body: UpdateProfileBody) {
    await this.profileRepository.saveProfile(userId, body);

    return {
      success: true,
      profileCompleted: true,
    };
  }
}
