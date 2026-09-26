import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [StorageModule],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
