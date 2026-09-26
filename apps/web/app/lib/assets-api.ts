import type {
  CreateAssetUploadSignatureRequest,
  CreateAssetUploadSignatureResponse,
  GetAssetPlaybackUrlResponse,
  VideoContentType,
} from '@ag-go-video-editor/shared';
import { getApiErrorMessage, isRecord, requestApi } from './api-client';

const videoContentType: VideoContentType = 'video/mp4';

function isUploadSignatureResponse(value: unknown): value is CreateAssetUploadSignatureResponse {
  return (
    isRecord(value) &&
    typeof value.assetId === 'string' &&
    typeof value.publicId === 'string' &&
    typeof value.cloudName === 'string' &&
    typeof value.apiKey === 'string' &&
    typeof value.timestamp === 'number' &&
    typeof value.signature === 'string' &&
    typeof value.uploadUrl === 'string'
  );
}

function isPlaybackUrlResponse(value: unknown): value is GetAssetPlaybackUrlResponse {
  return (
    isRecord(value) && typeof value.assetId === 'string' && typeof value.playbackUrl === 'string'
  );
}

export async function requestAssetUploadSignature(
  filename: string,
  signal: AbortSignal,
): Promise<CreateAssetUploadSignatureResponse> {
  const requestBody: CreateAssetUploadSignatureRequest = {
    filename,
    contentType: videoContentType,
  };
  const response = await requestApi(
    '/api/assets/upload-signature',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal,
    },
    'Không thể kết nối để chuẩn bị tải video nguồn.',
  );

  if (!response.ok) {
    const apiMessage = response.status < 500 ? getApiErrorMessage(response.body) : null;
    throw new Error(apiMessage ?? 'Không thể chuẩn bị tải video nguồn. Vui lòng thử lại.');
  }

  if (!isUploadSignatureResponse(response.body)) {
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
