import type {
  CreateRenderRequest,
  CreateRenderResponse,
  GetRenderPlaybackUrlResponse,
} from '@ag-go-video-editor/shared';
import { getApiErrorMessage, isRecord, requestApi } from './api-client';

function isCreateRenderResponse(value: unknown): value is CreateRenderResponse {
  return (
    isRecord(value) &&
    typeof value.renderId === 'string' &&
    value.status === 'completed' &&
    typeof value.outputKey === 'string'
  );
}

function isRenderPlaybackUrlResponse(value: unknown): value is GetRenderPlaybackUrlResponse {
  return (
    isRecord(value) &&
    typeof value.renderId === 'string' &&
    typeof value.playbackUrl === 'string' &&
    typeof value.expiresIn === 'number'
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
    'Không thể kết nối tới API để render video.',
  );

  if (!response.ok) {
    const apiMessage = getApiErrorMessage(response.body);
    throw new Error(apiMessage ?? `Render video thất bại (HTTP ${response.status}).`);
  }

  if (!isCreateRenderResponse(response.body)) {
    throw new Error('API trả về kết quả render không hợp lệ.');
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
    'Không thể kết nối tới API để lấy playback URL của video đã export.',
  );

  if (!response.ok) {
    const apiMessage = getApiErrorMessage(response.body);
    throw new Error(apiMessage ?? `Không thể lấy playback URL output (HTTP ${response.status}).`);
  }

  if (!isRenderPlaybackUrlResponse(response.body) || response.body.renderId !== renderId) {
    throw new Error('API trả về playback URL của output không hợp lệ.');
  }

  return response.body;
}
