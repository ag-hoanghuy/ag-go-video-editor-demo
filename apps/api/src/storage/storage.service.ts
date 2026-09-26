import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { R2_CONFIG, type R2Config } from './r2.config';

interface CreatePresignedPutUrlOptions {
  contentType: string;
  objectKey: string;
}

interface UploadFileOptions {
  contentType: string;
  filePath: string;
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

  async downloadObjectToFile(objectKey: string, filePath: string): Promise<void> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
      }),
    );

    if (!response.Body || !(response.Body instanceof Readable)) {
      throw new Error('R2 không trả về stream cho video nguồn.');
    }

    await pipeline(response.Body, createWriteStream(filePath, { flags: 'wx' }));
  }

  async uploadFile(options: UploadFileOptions): Promise<void> {
    const fileStats = await stat(options.filePath);
    const body = createReadStream(options.filePath);

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: options.objectKey,
          Body: body,
          ContentLength: fileStats.size,
          ContentType: options.contentType,
        }),
      );
    } finally {
      body.destroy();
    }
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
