import { Module } from '@nestjs/common';

import { HttpModule } from '../http/http.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeOrchestratorService } from './realtime.orchestrator.service';

@Module({
  imports: [HttpModule],
  providers: [RealtimeGateway, RealtimeOrchestratorService],
})
export class RealtimeModule {}
