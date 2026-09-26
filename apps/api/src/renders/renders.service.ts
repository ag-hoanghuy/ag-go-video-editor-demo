import type {
  CreateRenderRequest,
  CreateRenderResponse,
  GetRenderPlaybackUrlResponse,
} from '@ag-go-video-editor/shared';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  type HttpException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOriginalAssetPublicId } from '../assets/asset-public-id';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { StorageService } from '../storage/storage.service';
import { createRenderOutputPublicId } from './render-public-id';

@Injectable()
export class RendersService {
  constructor(
    private readonly storageService: StorageService,
    private readonly ffmpegService: FfmpegService,
  ) {}

  async createRender(request: CreateRenderRequest): Promise<CreateRenderResponse> {
    const renderId = randomUUID();
    const sourcePublicId = createOriginalAssetPublicId(request.assetId);
    const outputPublicId = createRenderOutputPublicId(renderId);
    let temporaryDirectory: string | undefined;

    try {
      temporaryDirectory = await mkdtemp(join(tmpdir(), 'ag-go-video-render-'));
      const sourcePath = join(temporaryDirectory, 'source.mp4');
      const outputPath = join(temporaryDirectory, 'output.mp4');

      await this.storageService.downloadVideoToFile(sourcePublicId, sourcePath);
      const sourceDuration = await this.ffmpegService.probeDuration(sourcePath);
      this.validateTrimDuration(request.trim.end, sourceDuration);
      await this.ffmpegService.trimVideo({
        inputPath: sourcePath,
        outputPath,
        start: request.trim.start,
        end: request.trim.end,
      });
      await this.storageService.uploadVideoFile({
        filePath: outputPath,
        publicId: outputPublicId,
      });

      return {
        renderId,
        status: 'completed',
      };
    } catch (error) {
      throw this.createSafeException(error);
    } finally {
      if (temporaryDirectory) {
        await this.removeTemporaryDirectory(temporaryDirectory);
      }
    }
  }

  async getPlaybackUrl(renderId: string): Promise<GetRenderPlaybackUrlResponse> {
    const outputPublicId = createRenderOutputPublicId(renderId);

    try {
      return {
        renderId,
        playbackUrl: this.storageService.createVideoDeliveryUrl(outputPublicId),
      };
    } catch {
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

  private async removeTemporaryDirectory(temporaryDirectory: string): Promise<void> {
    try {
      await rm(temporaryDirectory, { recursive: true, force: true });
    } catch {
      throw new InternalServerErrorException({
        statusCode: 500,
        error: 'Render video thất bại',
        message: 'Không thể dọn dẹp dữ liệu render tạm thời.',
      });
    }
  }
}
