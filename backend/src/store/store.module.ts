import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { StoreService } from './store.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [StoreService],
  exports: [StoreService],
})
export class StoreModule {}
