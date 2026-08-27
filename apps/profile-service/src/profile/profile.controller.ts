import { Body, Controller, Get, Param, Put } from '@nestjs/common';

import type { UpdateProfileBody } from '@yourpassenger/contracts';

import { ProfileService } from './profile.service';

@Controller('profiles')
export class ProfileController {
  // Receives profile HTTP requests and delegates profile operations.
  constructor(private readonly profileService: ProfileService) {}

  @Get(':userId')
  // Returns the stored profile for a path user id.
  async getProfile(@Param('userId') userId: string) {
    return this.profileService.getProfile(userId);
  }

  @Get(':userId/completion')
  // Returns whether a path user id has completed profile onboarding.
  async getProfileCompletion(@Param('userId') userId: string) {
    return this.profileService.getProfileCompletion(userId);
  }

  @Put(':userId')
  // Persists profile fields for a path user id.
  async updateProfile(
    @Param('userId') userId: string,
    @Body() body: UpdateProfileBody,
  ) {
    return this.profileService.updateProfile(userId, body);
  }
}
