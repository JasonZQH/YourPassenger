import { Global, Module } from '@nestjs/common';

import { InMemoryStoreService } from './store.service';

@Global()
@Module({
  providers: [InMemoryStoreService],
  exports: [InMemoryStoreService],
})
export class StoreModule {}
