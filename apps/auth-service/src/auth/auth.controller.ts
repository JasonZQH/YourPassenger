import { Body, Controller, Get, Post, Req } from '@nestjs/common';

import type { AppleAuthBody } from '@yourpassenger/contracts';

import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Controller()
export class AuthController {
  // Receives auth requests and delegates credential handling to the auth service.
  constructor(private readonly authService: AuthService) {}

  @Post('auth/apple')
  // Exchanges an Apple identity token for app credentials.
  async signInWithApple(@Body() body: AppleAuthBody) {
    return this.authService.signInWithApple(body.identityToken);
  }

  @Post('auth/guest')
  // Creates a guest session without an external identity provider.
  async signInAsGuest() {
    return this.authService.signInAsGuest();
  }

  @Get('me')
  // Returns the authenticated user's public profile.
  async getCurrentUser(@Req() request: AuthenticatedRequest) {
    return this.authService.getCurrentUser(request);
  }
}
