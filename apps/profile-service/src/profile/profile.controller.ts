import { Body, Controller, Get, Param, Put } from '@nestjs/common';

import type { UpdateProfileBody } from '@yourpassenger/contracts';

import { ProfileService } from './profile.service';

@Controller('profiles')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get(':userId')
  async getProfile(@Param('userId') userId: string) {
    return this.profileService.getProfile(userId);
  }

  @Get(':userId/completion')
  async getProfileCompletion(@Param('userId') userId: string) {
    return this.profileService.getProfileCompletion(userId);
  }

  @Put(':userId')
  async updateProfile(
    @Param('userId') userId: string,
    @Body() body: UpdateProfileBody,
  ) {
    return this.profileService.updateProfile(userId, body);
  }
}
