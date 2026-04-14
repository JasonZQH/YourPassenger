import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CreateSessionBody, EndSessionBody } from './session.types';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  createSession(@Body() _body: CreateSessionBody) {
    return this.sessionsService.createSession();
  }

  @Get(':id')
  getSession(@Param('id') id: string) {
    return this.sessionsService.getSession(id);
  }

  @Post(':id/end')
  endSession(@Param('id') id: string, @Body() _body: EndSessionBody) {
    return this.sessionsService.endSession(id);
  }

  @Get(':id/summary')
  getSummary(@Param('id') id: string) {
    return this.sessionsService.getSummary(id);
  }
}
