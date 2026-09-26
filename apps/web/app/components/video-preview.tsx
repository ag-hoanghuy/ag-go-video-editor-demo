'use client';

import { useEffect, useState } from 'react';
import { requestAssetPlaybackUrl } from '../lib/assets-api';

type PreviewPhase = 'preparing' | 'ready' | 'url-error' | 'playback-error';

interface VideoPreviewProps {
  assetId: string;
}

interface PreviewState {
  phase: PreviewPhase;
  playbackUrl?: string;
  duration?: number;
  errorMessage?: string;
}

const previewLabels: Record<PreviewPhase, string> = {
  preparing: 'Đang chuẩn bị preview...',
  ready: 'Preview sẵn sàng',
  'url-error': 'Không thể lấy playback URL',
  'playback-error': 'Video không thể phát',
};

function formatDuration(duration: number): string {
  const totalSeconds = Math.floor(duration);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể lấy URL tạm thời để preview video.';
}

export function VideoPreview({ assetId }: VideoPreviewProps) {
  const [previewState, setPreviewState] = useState<PreviewState>({ phase: 'preparing' });

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    void requestAssetPlaybackUrl(assetId, controller.signal)
      .then((response) => {
        if (isActive) {
          setPreviewState({ phase: 'preparing', playbackUrl: response.playbackUrl });
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setPreviewState({
            phase: 'url-error',
            errorMessage: getErrorMessage(error),
          });
        }
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [assetId]);

  function handleMetadataLoaded(event: React.SyntheticEvent<HTMLVideoElement>): void {
    const duration = event.currentTarget.duration;

    setPreviewState((currentState) => ({
      ...currentState,
      phase: 'ready',
      duration: Number.isFinite(duration) ? duration : undefined,
      errorMessage: undefined,
    }));
  }

  function handlePlaybackError(): void {
    setPreviewState((currentState) => ({
      ...currentState,
      phase: 'playback-error',
      errorMessage: 'Video không thể phát. Hãy kiểm tra object trên R2 và cấu hình CORS.',
    }));
  }

  const hasError = previewState.phase === 'url-error' || previewState.phase === 'playback-error';

  return (
    <section className="preview-panel" aria-labelledby="preview-heading">
      <div className="preview-heading-group">
        <div>
          <p className="section-label">Preview trực tiếp từ R2</p>
          <h3 id="preview-heading">Video vừa tải lên</h3>
        </div>
        <span className={`preview-status preview-status-${previewState.phase}`} role="status">
          {previewLabels[previewState.phase]}
        </span>
      </div>

      {previewState.playbackUrl ? (
        <video
          className="video-preview"
          src={previewState.playbackUrl}
          controls
          crossOrigin="anonymous"
          playsInline
          preload="metadata"
          onLoadedMetadata={handleMetadataLoaded}
          onError={handlePlaybackError}
        >
          Trình duyệt của bạn không hỗ trợ phát video HTML5.
        </video>
      ) : null}

      {previewState.duration !== undefined ? (
        <p className="video-duration">Thời lượng: {formatDuration(previewState.duration)}</p>
      ) : null}

      {hasError ? (
        <p className="upload-message upload-message-error">{previewState.errorMessage}</p>
      ) : null}
    </section>
  );
}
