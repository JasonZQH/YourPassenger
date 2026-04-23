import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';

import type { CreateSessionBody, EndSessionBody } from '@yourpassenger/contracts';

import { AuthService } from '../auth/auth.service';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  async createSession(@Req() request: AuthenticatedRequest, @Body() body: CreateSessionBody) {
    const { accessToken, user } = await this.authService.requireAuth(request);
    return this.sessionsService.createSession(user.id, accessToken, body);
  }

  @Get(':id')
  async getSession(@Req() request: AuthenticatedRequest, @Param('id') sessionId: string) {
    const { user } = await this.authService.requireAuth(request);
    return this.sessionsService.getSession(user.id, sessionId);
  }

  @Post(':id/end')
  async endSession(
    @Req() request: AuthenticatedRequest,
    @Param('id') sessionId: string,
    @Body() body: EndSessionBody,
  ) {
    const { user } = await this.authService.requireAuth(request);
    return this.sessionsService.endSession(user.id, sessionId, body);
  }

  @Get(':id/summary')
  async getSummary(@Req() request: AuthenticatedRequest, @Param('id') sessionId: string) {
    const { user } = await this.authService.requireAuth(request);
    return this.sessionsService.getSummary(user.id, sessionId);
  }
}
