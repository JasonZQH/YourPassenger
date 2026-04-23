import { Module } from '@nestjs/common';

import { HttpModule } from '../http/http.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [HttpModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
