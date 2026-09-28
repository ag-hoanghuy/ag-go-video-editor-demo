import { getFilmstripFrameCacheKey } from './filmstrip';

interface FrameCacheEntry {
  mediaId: string;
  objectUrl: string;
}

const frameWidth = 160;
const frameHeight = 90;
const frameQuality = 0.78;

function createAbortError(): DOMException {
  return new DOMException('Đã hủy tạo filmstrip.', 'AbortError');
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'seeked',
  signal: AbortSignal,
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
      reject(new Error('Không thể giải mã khung hình video.'));
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

function canvasToBlob(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let isSettled = false;

    const handleAbort = () => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      reject(createAbortError());
    };

    if (signal.aborted) {
      handleAbort();
      return;
    }

    signal.addEventListener('abort', handleAbort, { once: true });
    canvas.toBlob(
      (blob) => {
        if (isSettled) {
          return;
        }

        isSettled = true;
        signal.removeEventListener('abort', handleAbort);

        if (!blob) {
          reject(new Error('Không thể tạo ảnh filmstrip.'));
          return;
        }

        resolve(blob);
      },
      'image/jpeg',
      frameQuality,
    );
  });
}

function drawCoverFrame(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
): void {
  const sourceRatio = video.videoWidth / video.videoHeight;
  const targetRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = video.videoWidth;
  let sourceHeight = video.videoHeight;

  if (sourceRatio > targetRatio) {
    sourceWidth = video.videoHeight * targetRatio;
    sourceX = (video.videoWidth - sourceWidth) / 2;
  } else {
    sourceHeight = video.videoWidth / targetRatio;
    sourceY = (video.videoHeight - sourceHeight) / 2;
  }

  context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

export class FilmstripFrameManager {
  private readonly cache = new Map<string, FrameCacheEntry>();
  private readonly failedKeys = new Set<string>();
  private readonly inFlight = new Map<string, Promise<string | null>>();
  private readonly mediaAbortControllers = new Map<string, AbortController>();
  private readonly removedMediaIds = new Set<string>();
  private queueTail: Promise<void> = Promise.resolve();
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private currentMediaId: string | null = null;
  private currentObjectUrl: string | null = null;
  private isDisposed = false;

  requestFrame(mediaId: string, objectUrl: string, timestamp: number): Promise<string | null> {
    const cacheKey = getFilmstripFrameCacheKey(mediaId, timestamp);
    const cachedFrame = this.cache.get(cacheKey);

    if (cachedFrame) {
      return Promise.resolve(cachedFrame.objectUrl);
    }

    if (this.failedKeys.has(cacheKey) || this.removedMediaIds.has(mediaId) || this.isDisposed) {
      return Promise.resolve(null);
    }

    const pendingFrame = this.inFlight.get(cacheKey);

    if (pendingFrame) {
      return pendingFrame;
    }

    const signal = this.getMediaAbortController(mediaId).signal;
    const frameRequest = this.enqueue(async () => {
      if (signal.aborted || this.isDisposed || this.removedMediaIds.has(mediaId)) {
        return null;
      }

      try {
        const blob = await this.extractFrame(mediaId, objectUrl, timestamp, signal);

        if (signal.aborted || this.isDisposed || this.removedMediaIds.has(mediaId)) {
          return null;
        }

        const frameObjectUrl = URL.createObjectURL(blob);

        if (signal.aborted || this.isDisposed || this.removedMediaIds.has(mediaId)) {
          URL.revokeObjectURL(frameObjectUrl);
          return null;
        }

        this.cache.set(cacheKey, { mediaId, objectUrl: frameObjectUrl });
        return frameObjectUrl;
      } catch {
        if (!signal.aborted && !this.isDisposed && !this.removedMediaIds.has(mediaId)) {
          this.failedKeys.add(cacheKey);
        }

        return null;
      }
    });

    this.inFlight.set(cacheKey, frameRequest);
    void frameRequest.then(
      () => this.inFlight.delete(cacheKey),
      () => this.inFlight.delete(cacheKey),
    );

    return frameRequest;
  }

  removeMedia(mediaId: string): void {
    this.removedMediaIds.add(mediaId);
    this.mediaAbortControllers.get(mediaId)?.abort();
    this.mediaAbortControllers.delete(mediaId);

    for (const [cacheKey, frame] of this.cache) {
      if (frame.mediaId === mediaId) {
        URL.revokeObjectURL(frame.objectUrl);
        this.cache.delete(cacheKey);
      }
    }

    for (const cacheKey of this.failedKeys) {
      if (cacheKey.startsWith(`${mediaId}:`)) {
        this.failedKeys.delete(cacheKey);
      }
    }

    if (this.currentMediaId === mediaId) {
      this.releaseVideoSource();
    }
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    for (const controller of this.mediaAbortControllers.values()) {
      controller.abort();
    }

    this.mediaAbortControllers.clear();

    for (const frame of this.cache.values()) {
      URL.revokeObjectURL(frame.objectUrl);
    }

    this.cache.clear();
    this.failedKeys.clear();
    this.inFlight.clear();
    this.releaseVideoSource();
    this.video = null;
    this.canvas = null;
  }

  private enqueue(task: () => Promise<string | null>): Promise<string | null> {
    const result = this.queueTail.then(task, task);
    this.queueTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private getMediaAbortController(mediaId: string): AbortController {
    const currentController = this.mediaAbortControllers.get(mediaId);

    if (currentController) {
      return currentController;
    }

    const controller = new AbortController();
    this.mediaAbortControllers.set(mediaId, controller);
    return controller;
  }

  private getVideo(): HTMLVideoElement {
    if (!this.video) {
      this.video = document.createElement('video');
      this.video.preload = 'auto';
      this.video.muted = true;
      this.video.playsInline = true;
    }

    return this.video;
  }

  private getCanvas(): HTMLCanvasElement {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = frameWidth;
      this.canvas.height = frameHeight;
    }

    return this.canvas;
  }

  private async extractFrame(
    mediaId: string,
    objectUrl: string,
    timestamp: number,
    signal: AbortSignal,
  ): Promise<Blob> {
    const video = this.getVideo();
    await this.loadVideoSource(video, mediaId, objectUrl, signal);

    if (signal.aborted) {
      throw createAbortError();
    }

    if (video.readyState < 2 || Math.abs(video.currentTime - timestamp) >= 0.001) {
      const seekCompleted = waitForVideoEvent(video, 'seeked', signal);
      video.currentTime = timestamp;
      await seekCompleted;
    }

    if (signal.aborted) {
      throw createAbortError();
    }

    if (video.videoWidth <= 0 || video.videoHeight <= 0) {
      throw new Error('Kích thước video không hợp lệ.');
    }

    const canvas = this.getCanvas();
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Trình duyệt không hỗ trợ tạo filmstrip.');
    }

    drawCoverFrame(context, video, canvas.width, canvas.height);
    return canvasToBlob(canvas, signal);
  }

  private async loadVideoSource(
    video: HTMLVideoElement,
    mediaId: string,
    objectUrl: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (
      this.currentMediaId === mediaId &&
      this.currentObjectUrl === objectUrl &&
      video.readyState >= 1
    ) {
      return;
    }

    this.releaseVideoSource();
    this.currentMediaId = mediaId;
    this.currentObjectUrl = objectUrl;

    const metadataLoaded = waitForVideoEvent(video, 'loadedmetadata', signal);
    video.src = objectUrl;
    video.load();
    await metadataLoaded;
  }

  private releaseVideoSource(): void {
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }

    this.currentMediaId = null;
    this.currentObjectUrl = null;
  }
}
