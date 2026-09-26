import type {
  CreateAssetUploadUrlRequest,
  CreateAssetUploadUrlResponse,
  GetAssetPlaybackUrlResponse,
  VideoContentType,
} from '@ag-go-video-editor/shared';
import { getApiErrorMessage, isRecord, requestApi } from './api-client';

const videoContentType: VideoContentType = 'video/mp4';

function isUploadUrlResponse(value: unknown): value is CreateAssetUploadUrlResponse {
  return (
    isRecord(value) &&
    typeof value.assetId === 'string' &&
    typeof value.objectKey === 'string' &&
    typeof value.uploadUrl === 'string' &&
    typeof value.expiresIn === 'number'
  );
}

function isPlaybackUrlResponse(value: unknown): value is GetAssetPlaybackUrlResponse {
  return (
    isRecord(value) &&
    typeof value.assetId === 'string' &&
    typeof value.playbackUrl === 'string' &&
    typeof value.expiresIn === 'number'
  );
}

export async function requestAssetUploadUrl(
  filename: string,
): Promise<CreateAssetUploadUrlResponse> {
  const requestBody: CreateAssetUploadUrlRequest = {
    filename,
    contentType: videoContentType,
  };
  const response = await requestApi(
    '/api/assets/upload-url',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    },
    'Không thể kết nối để chuẩn bị tải video nguồn.',
  );

  if (!response.ok) {
    const apiMessage = response.status < 500 ? getApiErrorMessage(response.body) : null;
    throw new Error(apiMessage ?? 'Không thể chuẩn bị tải video nguồn. Vui lòng thử lại.');
  }

  if (!isUploadUrlResponse(response.body)) {
    throw new Error('Không thể chuẩn bị tải video nguồn.');
  }

  return response.body;
}

export async function requestAssetPlaybackUrl(
  assetId: string,
  signal: AbortSignal,
): Promise<GetAssetPlaybackUrlResponse> {
  const response = await requestApi(
    `/api/assets/${encodeURIComponent(assetId)}/playback-url`,
    {
      signal,
    },
    'Không thể kết nối để chuẩn bị video xem trước.',
  );

  if (!response.ok) {
    const apiMessage = response.status < 500 ? getApiErrorMessage(response.body) : null;
    throw new Error(apiMessage ?? 'Không thể tải video xem trước. Vui lòng thử lại.');
  }

  if (!isPlaybackUrlResponse(response.body) || response.body.assetId !== assetId) {
    throw new Error('Không thể chuẩn bị video xem trước.');
  }

  return response.body;
}
