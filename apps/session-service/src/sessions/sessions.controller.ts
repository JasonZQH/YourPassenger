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
  // Receives owned-session HTTP requests and delegates session operations.
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  // Creates a session for the user supplied in the request body.
  async createSession(@Body() body: CreateOwnedSessionBody) {
    return this.sessionsService.createSession(body);
  }

  @Get(':id')
  // Returns an owned session by path id and query user id.
  async getSession(@Param('id') sessionId: string, @Query() query: OwnedSessionQuery) {
    return this.sessionsService.getSession(query.userId, sessionId);
  }

  @Post(':id/end')
  // Ends an owned session and stores its summary.
  async endSession(@Param('id') sessionId: string, @Body() body: EndOwnedSessionBody) {
    return this.sessionsService.endSession(sessionId, body);
  }

  @Get(':id/summary')
  // Returns or generates the summary for an owned session.
  async getSummary(@Param('id') sessionId: string, @Query() query: OwnedSessionQuery) {
    return this.sessionsService.getSummary(query.userId, sessionId);
  }

  @Post(':id/turns')
  // Appends a single turn to an owned session.
  async appendTurn(@Param('id') sessionId: string, @Body() body: AppendSessionTurnBody) {
    return this.sessionsService.appendTurn(sessionId, body);
  }

  @Post(':id/realtime-turn')
  // Commits a paired realtime transcript and assistant reply.
  async commitRealtimeTurn(
    @Param('id') sessionId: string,
    @Body() body: CommitRealtimeTurnBody,
  ) {
    return this.sessionsService.commitRealtimeTurn(sessionId, body);
  }

  @Post(':id/assistant-state')
  // Updates the assistant state stored on an owned session.
  async updateAssistantState(
    @Param('id') sessionId: string,
    @Body() body: UpdateAssistantStateBody,
  ) {
    return this.sessionsService.updateAssistantState(sessionId, body);
  }

  @Put(':id/summary')
  // Upserts summary details for an owned session.
  async upsertSummary(
    @Param('id') sessionId: string,
    @Body() body: UpsertSessionSummaryBody,
  ) {
    return this.sessionsService.upsertSummary(sessionId, body);
  }
}
