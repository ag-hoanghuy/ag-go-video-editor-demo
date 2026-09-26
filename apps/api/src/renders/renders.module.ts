import { Module } from '@nestjs/common';
import { FfmpegModule } from '../ffmpeg/ffmpeg.module';
import { StorageModule } from '../storage/storage.module';
import { RendersController } from './renders.controller';
import { RendersService } from './renders.service';

@Module({
  imports: [StorageModule, FfmpegModule],
  controllers: [RendersController],
  providers: [RendersService],
})
export class RendersModule {}
