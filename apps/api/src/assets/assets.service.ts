import type { CreateAssetUploadUrlResponse, VideoContentType } from '@ag-go-video-editor/shared';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StorageService } from '../storage/storage.service';

const assetObjectPrefix = 'video-editor-demo/assets';

@Injectable()
export class AssetsService {
  constructor(private readonly storageService: StorageService) {}

  async createUploadUrl(contentType: VideoContentType): Promise<CreateAssetUploadUrlResponse> {
    const assetId = randomUUID();
    const objectKey = `${assetObjectPrefix}/${assetId}/original.mp4`;
    const presignedUrl = await this.storageService.createPresignedPutUrl({
      contentType,
      objectKey,
    });

    return {
      assetId,
      objectKey,
      uploadUrl: presignedUrl.url,
      expiresIn: presignedUrl.expiresIn,
    };
  }
}
