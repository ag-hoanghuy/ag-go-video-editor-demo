import type {
  CreateRenderRequest,
  CreateRenderResponse,
  GetRenderPlaybackUrlResponse,
  VideoContentType,
} from '@ag-go-video-editor/shared';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  type HttpException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOriginalAssetObjectKey } from '../assets/asset-object-key';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { StorageService } from '../storage/storage.service';
import { createRenderOutputObjectKey } from './render-object-key';

const videoContentType: VideoContentType = 'video/mp4';

@Injectable()
export class RendersService {
  private readonly logger = new Logger(RendersService.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly ffmpegService: FfmpegService,
  ) {}

  async createRender(request: CreateRenderRequest): Promise<CreateRenderResponse> {
    const renderId = randomUUID();
    const sourceKey = createOriginalAssetObjectKey(request.assetId);
    const outputKey = createRenderOutputObjectKey(renderId);
    let temporaryDirectory: string | undefined;

    try {
      this.logger.log(
        `Render ${renderId}: create temp directory for asset ${request.assetId}`,
      );

      const temporaryRoot = tmpdir();

      await mkdir(temporaryRoot, {
        recursive: true,
      });

      temporaryDirectory = await mkdtemp(
        join(temporaryRoot, 'ag-go-video-render-'),
      );

      const sourcePath = join(temporaryDirectory, 'source.mp4');
      const outputPath = join(temporaryDirectory, 'output.mp4');

      this.logger.log(`Render ${renderId}: download source from R2`);
      await this.storageService.downloadObjectToFile(sourceKey, sourcePath);

      this.logger.log(`Render ${renderId}: probe source duration`);
      const sourceDuration = await this.ffmpegService.probeDuration(sourcePath);

      this.logger.log(
        `Render ${renderId}: source duration=${sourceDuration}, trim=${request.trim.start}-${request.trim.end}`,
      );

      this.validateTrimDuration(request.trim.end, sourceDuration);

      this.logger.log(`Render ${renderId}: run ffmpeg`);
      await this.ffmpegService.trimVideo({
        inputPath: sourcePath,
        outputPath,
        start: request.trim.start,
        end: request.trim.end,
      });

      this.logger.log(`Render ${renderId}: upload output to R2`);
      await this.storageService.uploadFile({
        contentType: videoContentType,
        filePath: outputPath,
        objectKey: outputKey,
      });

      this.logger.log(`Render ${renderId}: completed`);

      return {
        renderId,
        status: 'completed',
        outputKey,
      };
    } catch (error) {
      this.logger.error(
        `Render ${renderId}: failed`,
        error instanceof Error ? error.stack : String(error),
      );

      throw this.createSafeException(error);
    } finally {
      if (temporaryDirectory) {
        await this.removeTemporaryDirectory(temporaryDirectory);
      }
    }
  }

  async getPlaybackUrl(renderId: string): Promise<GetRenderPlaybackUrlResponse> {
    const outputKey = createRenderOutputObjectKey(renderId);

    try {
      const presignedUrl =
        await this.storageService.createPresignedGetUrl(outputKey);

      return {
        renderId,
        playbackUrl: presignedUrl.url,
        expiresIn: presignedUrl.expiresIn,
      };
    } catch (error) {
      this.logger.error(
        `Render ${renderId}: failed to create playback URL`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new InternalServerErrorException({
        statusCode: 500,
        error: 'Không thể chuẩn bị video đã export',
        message: 'Không thể tạo playback URL cho video đã export.',
      });
    }
  }

  private validateTrimDuration(end: number, sourceDuration: number): void {
    if (end > sourceDuration) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Yêu cầu render không hợp lệ',
        message: ['end không được vượt quá thời lượng video nguồn.'],
      });
    }
  }

  private createSafeException(error: unknown): HttpException {
    if (error instanceof BadRequestException) {
      return error;
    }

    return new InternalServerErrorException({
      statusCode: 500,
      error: 'Render video thất bại',
      message: 'Không thể hoàn tất render video.',
    });
  }

  private async removeTemporaryDirectory(
    temporaryDirectory: string,
  ): Promise<void> {
    try {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    } catch (error) {
      this.logger.error(
        `Không thể xóa thư mục render tạm: ${temporaryDirectory}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new InternalServerErrorException({
        statusCode: 500,
        error: 'Render video thất bại',
        message: 'Không thể dọn dẹp dữ liệu render tạm thời.',
      });
    }
  }
}