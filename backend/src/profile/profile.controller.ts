import { Body, Controller, Get, Put, Req } from '@nestjs/common';

import { AuthService } from '../auth/auth.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { ProfileService } from './profile.service';
import { UpdateProfileBody } from './profile.types';

@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async getProfile(@Req() request: AuthenticatedRequest) {
    const { user } = await this.authService.requireAuth(request);
    return this.profileService.getProfile(user.id);
  }

  @Put()
  async updateProfile(@Req() request: AuthenticatedRequest, @Body() body: UpdateProfileBody) {
    const { user } = await this.authService.requireAuth(request);
    return this.profileService.updateProfile(user.id, body);
  }
}
