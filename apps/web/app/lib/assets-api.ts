import type {
  CreateAssetUploadUrlRequest,
  CreateAssetUploadUrlResponse,
  GetAssetPlaybackUrlResponse,
  VideoContentType,
} from '@ag-go-video-editor/shared';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const videoContentType: VideoContentType = 'video/mp4';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

function getApiErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.message === 'string') {
    return value.message;
  }

  if (Array.isArray(value.message) && value.message.every((item) => typeof item === 'string')) {
    return value.message.join(' ');
  }

  return typeof value.error === 'string' ? value.error : null;
}

async function getResponseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function requestAssetUploadUrl(
  filename: string,
): Promise<CreateAssetUploadUrlResponse> {
  const requestBody: CreateAssetUploadUrlRequest = {
    filename,
    contentType: videoContentType,
  };
  let response: Response;

  try {
    response = await fetch(`${apiUrl}/api/assets/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  } catch {
    throw new Error('Không thể kết nối tới API để chuẩn bị tải lên.');
  }

  const responseBody = await getResponseBody(response);

  if (!response.ok) {
    const apiMessage = getApiErrorMessage(responseBody);
    throw new Error(apiMessage ?? `API từ chối yêu cầu tải lên (HTTP ${response.status}).`);
  }

  if (!isUploadUrlResponse(responseBody)) {
    throw new Error('API trả về dữ liệu chuẩn bị tải lên không hợp lệ.');
  }

  return responseBody;
}

export async function requestAssetPlaybackUrl(
  assetId: string,
  signal: AbortSignal,
): Promise<GetAssetPlaybackUrlResponse> {
  let response: Response;

  try {
    response = await fetch(`${apiUrl}/api/assets/${encodeURIComponent(assetId)}/playback-url`, {
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    throw new Error('Không thể kết nối tới API để chuẩn bị preview.');
  }

  const responseBody = await getResponseBody(response);

  if (!response.ok) {
    const apiMessage = getApiErrorMessage(responseBody);
    throw new Error(apiMessage ?? `Không thể lấy playback URL (HTTP ${response.status}).`);
  }

  if (!isPlaybackUrlResponse(responseBody) || responseBody.assetId !== assetId) {
    throw new Error('API trả về dữ liệu preview không hợp lệ.');
  }

  return responseBody;
}
