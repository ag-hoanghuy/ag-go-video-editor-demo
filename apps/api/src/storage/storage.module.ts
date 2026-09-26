import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLOUDINARY_CONFIG, loadCloudinaryConfig } from './cloudinary.config';
import { StorageService } from './storage.service';

@Module({
  providers: [
    {
      provide: CLOUDINARY_CONFIG,
      inject: [ConfigService],
      useFactory: loadCloudinaryConfig,
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
