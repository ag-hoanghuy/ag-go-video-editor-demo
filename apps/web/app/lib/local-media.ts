export type LocalMediaStatus = 'processing' | 'ready' | 'error';

export interface LocalMediaItem {
  id: string;
  file: File;
  objectUrl: string;
  duration: number | null;
  thumbnailUrl: string | null;
  status: LocalMediaStatus;
  errorMessage: string | null;
}

const thumbnailWidth = 320;
const thumbnailQuality = 0.82;

function createAbortError(): DOMException {
  return new DOMException('Đã hủy xử lý video.', 'AbortError');
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createAbortError();
  }
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'seeked',
  signal: AbortSignal,
  errorMessage: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, handleSuccess);
      video.removeEventListener('error', handleError);
      signal.removeEventListener('abort', handleAbort);
    };

    const handleSuccess = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error(errorMessage));
    };

    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    if (signal.aborted) {
      handleAbort();
      return;
    }

    video.addEventListener(eventName, handleSuccess, { once: true });
    video.addEventListener('error', handleError, { once: true });
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

function releaseVideo(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute('src');
  video.load();
}

function canvasToBlob(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (signal.aborted) {
          reject(createAbortError());
          return;
        }

        if (!blob) {
          reject(new Error('Không thể tạo ảnh xem trước cho video này.'));
          return;
        }

        resolve(blob);
      },
      'image/jpeg',
      thumbnailQuality,
    );
  });
}

export function isMp4File(file: File): boolean {
  return file.name.toLowerCase().endsWith('.mp4') && file.type === 'video/mp4';
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function getLocalMediaErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể xử lý video này.';
}

export async function readLocalVideoDuration(
  objectUrl: string,
  signal: AbortSignal,
): Promise<number> {
  throwIfAborted(signal);

  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;

  try {
    const metadataLoaded = waitForVideoEvent(
      video,
      'loadedmetadata',
      signal,
      'Không thể đọc thông tin video.',
    );

    video.src = objectUrl;
    video.load();
    await metadataLoaded;

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('Thời lượng video không hợp lệ.');
    }

    return video.duration;
  } finally {
    releaseVideo(video);
  }
}

export async function createLocalVideoThumbnail(
  objectUrl: string,
  duration: number,
  signal: AbortSignal,
): Promise<Blob> {
  throwIfAborted(signal);

  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;

  try {
    const metadataLoaded = waitForVideoEvent(
      video,
      'loadedmetadata',
      signal,
      'Không thể tải video để tạo ảnh xem trước.',
    );

    video.src = objectUrl;
    video.load();
    await metadataLoaded;

    const thumbnailTime = Math.min(duration * 0.1, 1);
    const seekCompleted = waitForVideoEvent(
      video,
      'seeked',
      signal,
      'Không thể lấy khung hình xem trước.',
    );

    video.currentTime = thumbnailTime;
    await seekCompleted;
    throwIfAborted(signal);

    if (video.videoWidth <= 0 || video.videoHeight <= 0) {
      throw new Error('Kích thước video không hợp lệ.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = thumbnailWidth;
    canvas.height = Math.max(
      1,
      Math.round((thumbnailWidth * video.videoHeight) / video.videoWidth),
    );

    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Trình duyệt không hỗ trợ tạo ảnh xem trước.');
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await canvasToBlob(canvas, signal);
  } finally {
    releaseVideo(video);
  }
}

export function formatMediaDuration(duration: number | null): string {
  if (duration === null || !Number.isFinite(duration)) {
    return '--:--';
  }

  const totalSeconds = Math.max(0, Math.floor(duration));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
  }

  return [minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

export function formatMediaFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = size / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = value >= 10 ? 1 : 2;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}
