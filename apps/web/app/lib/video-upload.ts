import type { CreateAssetUploadSignatureResponse } from '@ag-go-video-editor/shared';

export function uploadVideoToCloudinary(
  file: File,
  uploadDetails: CreateAssetUploadSignatureResponse,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();
    let settled = false;

    formData.append('file', file);
    formData.append('api_key', uploadDetails.apiKey);
    formData.append('timestamp', String(uploadDetails.timestamp));
    formData.append('signature', uploadDetails.signature);
    formData.append('public_id', uploadDetails.publicId);

    const cleanup = () => {
      signal.removeEventListener('abort', abortRequest);
      request.upload.removeEventListener('progress', handleProgress);
      request.removeEventListener('load', handleLoad);
      request.removeEventListener('error', handleError);
      request.removeEventListener('abort', handleAbort);
    };

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const handleProgress = (event: ProgressEvent) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    const handleLoad = () => {
      if (request.status >= 200 && request.status < 300) {
        finish(resolve);
        return;
      }

      finish(() => reject(new Error('Dịch vụ lưu trữ từ chối video nguồn. Vui lòng thử lại.')));
    };

    const handleError = () => {
      finish(() =>
        reject(new Error('Không thể tải video nguồn lên. Hãy kiểm tra kết nối và thử lại.')),
      );
    };

    const handleAbort = () => {
      finish(() => reject(new Error('Quá trình tải file lên đã bị hủy.')));
    };

    const abortRequest = () => request.abort();

    if (signal.aborted) {
      reject(new Error('Quá trình tải file lên đã bị hủy.'));
      return;
    }

    request.upload.addEventListener('progress', handleProgress);
    request.addEventListener('load', handleLoad);
    request.addEventListener('error', handleError);
    request.addEventListener('abort', handleAbort);
    signal.addEventListener('abort', abortRequest, { once: true });
    request.open('POST', uploadDetails.uploadUrl);
    request.send(formData);
  });
}
