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
    'Không thể kết nối tới API để chuẩn bị tải lên.',
  );

  if (!response.ok) {
    const apiMessage = getApiErrorMessage(response.body);
    throw new Error(apiMessage ?? `API từ chối yêu cầu tải lên (HTTP ${response.status}).`);
  }

  if (!isUploadUrlResponse(response.body)) {
    throw new Error('API trả về dữ liệu chuẩn bị tải lên không hợp lệ.');
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
    'Không thể kết nối tới API để chuẩn bị preview.',
  );

  if (!response.ok) {
    const apiMessage = getApiErrorMessage(response.body);
    throw new Error(apiMessage ?? `Không thể lấy playback URL (HTTP ${response.status}).`);
  }

  if (!isPlaybackUrlResponse(response.body) || response.body.assetId !== assetId) {
    throw new Error('API trả về dữ liệu preview không hợp lệ.');
  }

  return response.body;
}
