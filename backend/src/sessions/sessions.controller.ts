import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';

import { AuthService } from '../auth/auth.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CreateSessionBody, EndSessionBody } from './session.types';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  async createSession(@Req() request: AuthenticatedRequest, @Body() _body: CreateSessionBody) {
    const { accessToken, user } = await this.authService.requireAuth(request);
    return this.sessionsService.createSession(user.id, accessToken);
  }

  @Get(':id')
  async getSession(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const { user } = await this.authService.requireAuth(request);
    return this.sessionsService.getSession(user.id, id);
  }

  @Post(':id/end')
  async endSession(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() _body: EndSessionBody,
  ) {
    const { user } = await this.authService.requireAuth(request);
    return this.sessionsService.endSession(user.id, id);
  }

  @Get(':id/summary')
  async getSummary(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const { user } = await this.authService.requireAuth(request);
    return this.sessionsService.getSummary(user.id, id);
  }
}
