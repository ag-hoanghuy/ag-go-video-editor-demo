import type {
  CreateRenderRequest,
  CreateRenderResponse,
  GetRenderPlaybackUrlResponse,
} from '@ag-go-video-editor/shared';
import { getApiErrorMessage, isRecord, requestApi } from './api-client';

function isCreateRenderResponse(value: unknown): value is CreateRenderResponse {
  return isRecord(value) && typeof value.renderId === 'string' && value.status === 'completed';
}

function isRenderPlaybackUrlResponse(value: unknown): value is GetRenderPlaybackUrlResponse {
  return (
    isRecord(value) && typeof value.renderId === 'string' && typeof value.playbackUrl === 'string'
  );
}

export async function requestRender(
  requestBody: CreateRenderRequest,
  signal: AbortSignal,
): Promise<CreateRenderResponse> {
  const response = await requestApi(
    '/api/renders',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal,
    },
    'Không thể kết nối để xuất video.',
  );

  if (!response.ok) {
    const apiMessage = response.status < 500 ? getApiErrorMessage(response.body) : null;
    throw new Error(apiMessage ?? 'Không thể xuất video. Vui lòng thử lại.');
  }

  if (!isCreateRenderResponse(response.body)) {
    throw new Error('Kết quả xuất video không hợp lệ.');
  }

  return response.body;
}

export async function requestRenderPlaybackUrl(
  renderId: string,
  signal: AbortSignal,
): Promise<GetRenderPlaybackUrlResponse> {
  const response = await requestApi(
    `/api/renders/${encodeURIComponent(renderId)}/playback-url`,
    { signal },
    'Không thể kết nối để chuẩn bị video đã xuất.',
  );

  if (!response.ok) {
    throw new Error('Không thể tải video đã xuất. Vui lòng thử lại.');
  }

  if (!isRenderPlaybackUrlResponse(response.body) || response.body.renderId !== renderId) {
    throw new Error('Không thể chuẩn bị video đã xuất.');
  }

  return response.body;
}
