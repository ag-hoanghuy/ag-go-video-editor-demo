import { v2 as cloudinary } from 'cloudinary';
import { Inject, Injectable } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { CLOUDINARY_CONFIG, type CloudinaryConfig } from './cloudinary.config';

interface UploadVideoFileOptions {
  filePath: string;
  publicId: string;
}

export interface SignedVideoUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  uploadUrl: string;
}

@Injectable()
export class StorageService {
  constructor(@Inject(CLOUDINARY_CONFIG) private readonly config: CloudinaryConfig) {
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      secure: true,
    });
  }

  createSignedVideoUpload(publicId: string): SignedVideoUpload {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { public_id: publicId, timestamp },
      this.config.apiSecret,
    );

    return {
      cloudName: this.config.cloudName,
      apiKey: this.config.apiKey,
      timestamp,
      signature,
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.config.cloudName}/video/upload`,
    };
  }

  createVideoDeliveryUrl(publicId: string): string {
    return cloudinary.url(publicId, {
      resource_type: 'video',
      secure: true,
      format: 'mp4',
    });
  }

  async downloadVideoToFile(publicId: string, filePath: string): Promise<void> {
    const response = await fetch(this.createVideoDeliveryUrl(publicId));

    if (!response.ok || !response.body) {
      throw new Error('Không thể tải video nguồn từ Cloudinary.');
    }

    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
      createWriteStream(filePath, { flags: 'wx' }),
    );
  }

  async uploadVideoFile(options: UploadVideoFileOptions): Promise<void> {
    await cloudinary.uploader.upload(options.filePath, {
      public_id: options.publicId,
      resource_type: 'video',
      overwrite: true,
      format: 'mp4',
    });
  }
}
