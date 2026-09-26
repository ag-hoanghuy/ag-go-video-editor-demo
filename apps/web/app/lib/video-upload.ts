import type {
  CreateAssetUploadUrlRequest,
  CreateAssetUploadUrlResponse,
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

  const responseBody: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const apiMessage = getApiErrorMessage(responseBody);
    throw new Error(apiMessage ?? `API từ chối yêu cầu tải lên (HTTP ${response.status}).`);
  }

  if (!isUploadUrlResponse(responseBody)) {
    throw new Error('API trả về dữ liệu chuẩn bị tải lên không hợp lệ.');
  }

  return responseBody;
}

export function uploadVideoToR2(
  file: File,
  uploadUrl: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }

      reject(new Error(`R2 từ chối file tải lên (HTTP ${request.status}).`));
    });
    request.addEventListener('error', () => {
      reject(new Error('Không thể tải file lên R2. Hãy kiểm tra kết nối và cấu hình CORS.'));
    });
    request.addEventListener('abort', () => {
      reject(new Error('Quá trình tải file lên đã bị hủy.'));
    });

    request.open('PUT', uploadUrl);
    request.setRequestHeader('Content-Type', videoContentType);
    request.send(file);
  });
}
