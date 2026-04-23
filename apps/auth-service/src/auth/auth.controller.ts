import { Body, Controller, Get, Post, Req } from '@nestjs/common';

import type { AppleAuthBody } from '@yourpassenger/contracts';

import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/apple')
  async signInWithApple(@Body() body: AppleAuthBody) {
    return this.authService.signInWithApple(body.identityToken);
  }

  @Post('auth/guest')
  async signInAsGuest() {
    return this.authService.signInAsGuest();
  }

  @Get('me')
  async getCurrentUser(@Req() request: AuthenticatedRequest) {
    return this.authService.getCurrentUser(request);
  }
}
