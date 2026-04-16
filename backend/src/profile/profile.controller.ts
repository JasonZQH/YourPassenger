import { Body, Controller, Get, Put } from '@nestjs/common';

import { ProfileService } from './profile.service';
import { UpdateProfileBody } from './profile.types';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  async getProfile() {
    return this.profileService.getProfile();
  }

  @Put()
  async updateProfile(@Body() body: UpdateProfileBody) {
    return this.profileService.updateProfile(body);
  }
}
