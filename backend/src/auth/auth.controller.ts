import { Body, Controller, Get, Post } from '@nestjs/common';

import { AppleAuthBody } from './auth.types';
import { AuthService } from './auth.service';

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
  async getCurrentUser() {
    return this.authService.getCurrentUser();
  }
}
