import type {
  CreateRenderRequest,
  CreateRenderResponse,
  VideoContentType,
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
import { createOriginalAssetObjectKey } from '../assets/asset-object-key';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { StorageService } from '../storage/storage.service';

const renderObjectPrefix = 'video-editor-demo/renders';
const videoContentType: VideoContentType = 'video/mp4';

function createRenderOutputKey(renderId: string): string {
  return `${renderObjectPrefix}/${renderId}/output.mp4`;
}

@Injectable()
export class RendersService {
  constructor(
    private readonly storageService: StorageService,
    private readonly ffmpegService: FfmpegService,
  ) {}

  async createRender(request: CreateRenderRequest): Promise<CreateRenderResponse> {
    const renderId = randomUUID();
    const sourceKey = createOriginalAssetObjectKey(request.assetId);
    const outputKey = createRenderOutputKey(renderId);
    let temporaryDirectory: string | undefined;

    try {
      temporaryDirectory = await mkdtemp(join(tmpdir(), 'ag-go-video-render-'));
      const sourcePath = join(temporaryDirectory, 'source.mp4');
      const outputPath = join(temporaryDirectory, 'output.mp4');

      await this.storageService.downloadObjectToFile(sourceKey, sourcePath);
      const sourceDuration = await this.ffmpegService.probeDuration(sourcePath);
      this.validateTrimDuration(request.trim.end, sourceDuration);
      await this.ffmpegService.trimVideo({
        inputPath: sourcePath,
        outputPath,
        start: request.trim.start,
        end: request.trim.end,
      });
      await this.storageService.uploadFile({
        contentType: videoContentType,
        filePath: outputPath,
        objectKey: outputKey,
      });

      return {
        renderId,
        status: 'completed',
        outputKey,
      };
    } catch (error) {
      throw this.createSafeException(error);
    } finally {
      if (temporaryDirectory) {
        await this.removeTemporaryDirectory(temporaryDirectory);
      }
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
