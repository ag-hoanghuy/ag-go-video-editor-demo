import type { ConfigService } from '@nestjs/config';

const maximumPresignedUrlTtlSeconds = 604_800;
const minimumPresignedUrlTtlSeconds = 1;
const r2HostnameSuffix = '.r2.cloudflarestorage.com';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  presignedUrlTtlSeconds: number;
}

export const R2_CONFIG = Symbol('R2_CONFIG');

function readRequiredValue(configService: ConfigService, name: string): string {
  const value = configService.get<unknown>(name);

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Thiếu cấu hình R2 bắt buộc: ${name}.`);
  }

  return value.trim();
}

function parseAccountId(value: string): string {
  if (!/^[a-f0-9]{32}$/i.test(value)) {
    throw new Error('R2_ACCOUNT_ID phải là Cloudflare account ID gồm 32 ký tự hex.');
  }

  return value;
}

function parseEndpoint(value: string, accountId: string): string {
  let endpoint: URL;

  try {
    endpoint = new URL(value);
  } catch {
    throw new Error('R2_ENDPOINT phải là URL HTTPS hợp lệ.');
  }

  const usesR2Hostname =
    endpoint.hostname.startsWith(`${accountId}.`) && endpoint.hostname.endsWith(r2HostnameSuffix);
  const hasCleanOrigin =
    endpoint.protocol === 'https:' &&
    endpoint.pathname === '/' &&
    endpoint.search === '' &&
    endpoint.hash === '' &&
    endpoint.username === '' &&
    endpoint.password === '';

  if (!usesR2Hostname || !hasCleanOrigin) {
    throw new Error('R2_ENDPOINT phải là S3 API endpoint HTTPS của R2_ACCOUNT_ID đã cấu hình.');
  }

  return endpoint.origin;
}

function parsePresignedUrlTtl(value: string): number {
  const ttlSeconds = Number(value);

  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < minimumPresignedUrlTtlSeconds ||
    ttlSeconds > maximumPresignedUrlTtlSeconds
  ) {
    throw new Error(
      `R2_PRESIGNED_URL_TTL_SECONDS phải là số nguyên từ ${minimumPresignedUrlTtlSeconds} đến ${maximumPresignedUrlTtlSeconds}.`,
    );
  }

  return ttlSeconds;
}

export function loadR2Config(configService: ConfigService): R2Config {
  const accountId = parseAccountId(readRequiredValue(configService, 'R2_ACCOUNT_ID'));
  const endpoint = parseEndpoint(readRequiredValue(configService, 'R2_ENDPOINT'), accountId);

  return {
    accountId,
    accessKeyId: readRequiredValue(configService, 'R2_ACCESS_KEY_ID'),
    secretAccessKey: readRequiredValue(configService, 'R2_SECRET_ACCESS_KEY'),
    bucket: readRequiredValue(configService, 'R2_BUCKET'),
    endpoint,
    presignedUrlTtlSeconds: parsePresignedUrlTtl(
      readRequiredValue(configService, 'R2_PRESIGNED_URL_TTL_SECONDS'),
    ),
  };
}
