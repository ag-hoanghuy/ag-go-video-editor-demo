import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { loadR2Config, R2_CONFIG } from './r2.config';
import { StorageService } from './storage.service';

@Module({
  providers: [
    {
      provide: R2_CONFIG,
      inject: [ConfigService],
      useFactory: loadR2Config,
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
