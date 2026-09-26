import type { ConfigService } from '@nestjs/config';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export const CLOUDINARY_CONFIG = Symbol('CLOUDINARY_CONFIG');

function readRequiredValue(configService: ConfigService, name: string): string {
  const value = configService.get<unknown>(name);

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Thiếu cấu hình Cloudinary bắt buộc: ${name}.`);
  }

  return value.trim();
}

export function loadCloudinaryConfig(configService: ConfigService): CloudinaryConfig {
  const cloudName = readRequiredValue(configService, 'CLOUDINARY_CLOUD_NAME');

  if (!/^[a-zA-Z0-9_-]+$/.test(cloudName)) {
    throw new Error('CLOUDINARY_CLOUD_NAME không hợp lệ.');
  }

  return {
    cloudName,
    apiKey: readRequiredValue(configService, 'CLOUDINARY_API_KEY'),
    apiSecret: readRequiredValue(configService, 'CLOUDINARY_API_SECRET'),
  };
}
