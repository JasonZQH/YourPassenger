import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';

import type {
  AppendSessionTurnBody,
  CommitRealtimeTurnBody,
  CreateOwnedSessionBody,
  EndOwnedSessionBody,
  OwnedSessionQuery,
  UpdateAssistantStateBody,
  UpsertSessionSummaryBody,
} from '@yourpassenger/contracts';

import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  async createSession(@Body() body: CreateOwnedSessionBody) {
    return this.sessionsService.createSession(body);
  }

  @Get(':id')
  async getSession(@Param('id') sessionId: string, @Query() query: OwnedSessionQuery) {
    return this.sessionsService.getSession(query.userId, sessionId);
  }

  @Post(':id/end')
  async endSession(@Param('id') sessionId: string, @Body() body: EndOwnedSessionBody) {
    return this.sessionsService.endSession(sessionId, body);
  }

  @Get(':id/summary')
  async getSummary(@Param('id') sessionId: string, @Query() query: OwnedSessionQuery) {
    return this.sessionsService.getSummary(query.userId, sessionId);
  }

  @Post(':id/turns')
  async appendTurn(@Param('id') sessionId: string, @Body() body: AppendSessionTurnBody) {
    return this.sessionsService.appendTurn(sessionId, body);
  }

  @Post(':id/realtime-turn')
  async commitRealtimeTurn(
    @Param('id') sessionId: string,
    @Body() body: CommitRealtimeTurnBody,
  ) {
    return this.sessionsService.commitRealtimeTurn(sessionId, body);
  }

  @Post(':id/assistant-state')
  async updateAssistantState(
    @Param('id') sessionId: string,
    @Body() body: UpdateAssistantStateBody,
  ) {
    return this.sessionsService.updateAssistantState(sessionId, body);
  }

  @Put(':id/summary')
  async upsertSummary(
    @Param('id') sessionId: string,
    @Body() body: UpsertSessionSummaryBody,
  ) {
    return this.sessionsService.upsertSummary(sessionId, body);
  }
}
