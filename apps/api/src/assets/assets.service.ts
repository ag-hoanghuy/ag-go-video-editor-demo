import type {
  CreateAssetUploadUrlResponse,
  GetAssetPlaybackUrlResponse,
  VideoContentType,
} from '@ag-go-video-editor/shared';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StorageService } from '../storage/storage.service';
import { createOriginalAssetObjectKey } from './asset-object-key';

@Injectable()
export class AssetsService {
  constructor(private readonly storageService: StorageService) {}

  async createUploadUrl(contentType: VideoContentType): Promise<CreateAssetUploadUrlResponse> {
    const assetId = randomUUID();
    const objectKey = createOriginalAssetObjectKey(assetId);
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

  async getPlaybackUrl(assetId: string): Promise<GetAssetPlaybackUrlResponse> {
    const objectKey = createOriginalAssetObjectKey(assetId);
    const presignedUrl = await this.storageService.createPresignedGetUrl(objectKey);

    return {
      assetId,
      playbackUrl: presignedUrl.url,
      expiresIn: presignedUrl.expiresIn,
    };
  }
}
