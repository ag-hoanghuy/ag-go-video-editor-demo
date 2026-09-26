import type {
  CreateAssetUploadSignatureResponse,
  GetAssetPlaybackUrlResponse,
} from '@ag-go-video-editor/shared';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StorageService } from '../storage/storage.service';
import { createOriginalAssetPublicId } from './asset-public-id';

@Injectable()
export class AssetsService {
  constructor(private readonly storageService: StorageService) {}

  createUploadSignature(): CreateAssetUploadSignatureResponse {
    const assetId = randomUUID();
    const publicId = createOriginalAssetPublicId(assetId);
    const signedUpload = this.storageService.createSignedVideoUpload(publicId);

    return {
      assetId,
      publicId,
      ...signedUpload,
    };
  }

  async getPlaybackUrl(assetId: string): Promise<GetAssetPlaybackUrlResponse> {
    const publicId = createOriginalAssetPublicId(assetId);

    return {
      assetId,
      playbackUrl: this.storageService.createVideoDeliveryUrl(publicId),
    };
  }
}
