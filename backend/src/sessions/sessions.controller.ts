import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CreateSessionBody, EndSessionBody } from './session.types';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  async createSession(@Body() _body: CreateSessionBody) {
    return this.sessionsService.createSession();
  }

  @Get(':id')
  async getSession(@Param('id') id: string) {
    return this.sessionsService.getSession(id);
  }

  @Post(':id/end')
  async endSession(@Param('id') id: string, @Body() _body: EndSessionBody) {
    return this.sessionsService.endSession(id);
  }

  @Get(':id/summary')
  async getSummary(@Param('id') id: string) {
    return this.sessionsService.getSummary(id);
  }
}
