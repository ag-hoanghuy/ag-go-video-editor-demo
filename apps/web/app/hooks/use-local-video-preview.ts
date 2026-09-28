'use client';

import { useEffect, useRef, type RefObject } from 'react';

export type PreviewControlMode = 'library' | 'timeline';

export interface LocalVideoPreviewTarget {
  mediaId: string;
  objectUrl: string;
  mode: PreviewControlMode;
  requestVersion: number;
  sourceTime: number | null;
}

function waitForLoadedMetadata(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  if (video.readyState >= 1) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
      signal.removeEventListener('abort', handleAbort);
    };

    const handleLoadedMetadata = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Không thể tải video xem trước.'));
    };

    const handleAbort = () => {
      cleanup();
      reject(new DOMException('Đã hủy cập nhật xem trước.', 'AbortError'));
    };

    if (signal.aborted) {
      handleAbort();
      return;
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
    video.addEventListener('error', handleError, { once: true });
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

export function useLocalVideoPreview(
  videoRef: RefObject<HTMLVideoElement | null>,
  target: LocalVideoPreviewTarget | null,
): void {
  const generationRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const loadedMediaIdRef = useRef<string | null>(null);
  const loadedObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    const generation = generationRef.current + 1;
    generationRef.current = generation;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const video = videoRef.current;

      if (!target) {
        if (video) {
          video.pause();
          video.removeAttribute('src');
          video.load();
        }

        loadedMediaIdRef.current = null;
        loadedObjectUrlRef.current = null;
        return;
      }

      if (!video) {
        return;
      }

      const sourceChanged =
        loadedMediaIdRef.current !== target.mediaId ||
        loadedObjectUrlRef.current !== target.objectUrl;

      if (target.mode === 'timeline') {
        video.pause();
      }

      if (sourceChanged) {
        loadedMediaIdRef.current = target.mediaId;
        loadedObjectUrlRef.current = target.objectUrl;
        video.src = target.objectUrl;
        video.load();
      }

      void (async () => {
        try {
          await waitForLoadedMetadata(video, abortController.signal);
        } catch {
          return;
        }

        if (
          generationRef.current !== generation ||
          loadedMediaIdRef.current !== target.mediaId ||
          loadedObjectUrlRef.current !== target.objectUrl
        ) {
          return;
        }

        if (target.mode === 'timeline' && target.sourceTime !== null) {
          video.pause();

          if (Math.abs(video.currentTime - target.sourceTime) >= 0.0005) {
            video.currentTime = target.sourceTime;
          }
        }
      })();
    });

    return () => {
      abortController.abort();

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (generationRef.current === generation) {
        generationRef.current += 1;
      }
    };
  }, [target, videoRef]);
}
