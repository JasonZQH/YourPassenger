import { Body, Controller, Get, Post } from '@nestjs/common';

import { AppleAuthBody } from './auth.types';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/apple')
  signInWithApple(@Body() body: AppleAuthBody) {
    return this.authService.signInWithApple(body.identityToken);
  }

  @Post('auth/guest')
  signInAsGuest() {
    return this.authService.signInAsGuest();
  }

  @Get('me')
  getCurrentUser() {
    return this.authService.getCurrentUser();
  }
}
