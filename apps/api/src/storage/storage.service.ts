import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { R2_CONFIG, type R2Config } from './r2.config';

interface CreatePresignedPutUrlOptions {
  contentType: string;
  objectKey: string;
}

export interface PresignedUrlResult {
  url: string;
  expiresIn: number;
}

@Injectable()
export class StorageService {
  private readonly client: S3Client;

  constructor(@Inject(R2_CONFIG) private readonly config: R2Config) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async createPresignedPutUrl(options: CreatePresignedPutUrlOptions): Promise<PresignedUrlResult> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: options.objectKey,
      ContentType: options.contentType,
    });

    return this.sign(command, new Set(['content-type']));
  }

  async createPresignedGetUrl(objectKey: string): Promise<PresignedUrlResult> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
    });

    return this.sign(command);
  }

  private async sign(
    command: GetObjectCommand | PutObjectCommand,
    signableHeaders?: Set<string>,
  ): Promise<PresignedUrlResult> {
    const expiresIn = this.config.presignedUrlTtlSeconds;
    const url = await getSignedUrl(this.client, command, { expiresIn, signableHeaders });

    return { url, expiresIn };
  }
}
