import type { VideoContentType } from '@ag-go-video-editor/shared';

const videoContentType: VideoContentType = 'video/mp4';

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

      reject(new Error('Dịch vụ lưu trữ từ chối video nguồn. Vui lòng thử lại.'));
    });
    request.addEventListener('error', () => {
      reject(new Error('Không thể tải video nguồn lên. Hãy kiểm tra kết nối và thử lại.'));
    });
    request.addEventListener('abort', () => {
      reject(new Error('Quá trình tải file lên đã bị hủy.'));
    });

    request.open('PUT', uploadUrl);
    request.setRequestHeader('Content-Type', videoContentType);
    request.send(file);
  });
}
