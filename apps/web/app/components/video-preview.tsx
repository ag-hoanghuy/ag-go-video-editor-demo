'use client';

import type { SyntheticEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { requestAssetPlaybackUrl } from '../lib/assets-api';
import { VideoExport } from './video-export';
import { formatTimelineTime, type TrimSelection, VideoTrimTimeline } from './video-trim-timeline';

type PreviewPhase = 'preparing' | 'ready' | 'url-error' | 'playback-error';

interface VideoPreviewProps {
  assetId: string;
}

interface PreviewState {
  phase: PreviewPhase;
  playbackUrl?: string;
  errorMessage?: string;
}

interface EditState {
  assetId: string;
  trim: TrimSelection;
}

const previewLabels: Record<PreviewPhase, string> = {
  preparing: 'Đang chuẩn bị video...',
  ready: 'Sẵn sàng xem trước',
  'url-error': 'Không thể tải video xem trước',
  'playback-error': 'Video không thể phát',
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể chuẩn bị video xem trước.';
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function VideoPreview({ assetId }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewState, setPreviewState] = useState<PreviewState>({ phase: 'preparing' });
  const [duration, setDuration] = useState<number>();
  const [currentTime, setCurrentTime] = useState(0);
  const [editState, setEditState] = useState<EditState>();
  const [isPlayingSelection, setIsPlayingSelection] = useState(false);
  const selectionEnd = editState?.trim.end;

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

  useEffect(() => {
    if (!isPlayingSelection || selectionEnd === undefined) {
      return;
    }

    const playbackEnd = selectionEnd;
    let animationFrameId: number;

    function updateSelectedPlayback(): void {
      const video = videoRef.current;

      if (!video) {
        return;
      }

      if (video.currentTime >= playbackEnd) {
        video.pause();
        video.currentTime = playbackEnd;
        setCurrentTime(playbackEnd);
        setIsPlayingSelection(false);
        return;
      }

      setCurrentTime(video.currentTime);
      animationFrameId = window.requestAnimationFrame(updateSelectedPlayback);
    }

    animationFrameId = window.requestAnimationFrame(updateSelectedPlayback);

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [isPlayingSelection, selectionEnd]);

  function handleMetadataLoaded(event: SyntheticEvent<HTMLVideoElement>): void {
    const loadedDuration = event.currentTarget.duration;

    if (!Number.isFinite(loadedDuration) || loadedDuration <= 0) {
      setPreviewState((currentState) => ({
        ...currentState,
        phase: 'playback-error',
        errorMessage: 'Không thể xác định thời lượng video để tạo timeline.',
      }));
      return;
    }

    setPreviewState((currentState) => ({
      ...currentState,
      phase: 'ready',
      errorMessage: undefined,
    }));
    setDuration(loadedDuration);
    setCurrentTime(0);
    setEditState({
      assetId,
      trim: { start: 0, end: loadedDuration },
    });
    setIsPlayingSelection(false);
  }

  function handlePlaybackError(): void {
    setPreviewState((currentState) => ({
      ...currentState,
      phase: 'playback-error',
      errorMessage: 'Video nguồn không thể phát. Hãy kiểm tra kết nối và thử lại.',
    }));
    setIsPlayingSelection(false);
  }

  function seekVideo(time: number): void {
    const video = videoRef.current;

    if (!video || duration === undefined) {
      return;
    }

    const nextTime = clamp(time, 0, duration);
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function handleTimeUpdate(event: SyntheticEvent<HTMLVideoElement>): void {
    const video = event.currentTarget;
    const nextTime = video.currentTime;

    if (isPlayingSelection && editState && nextTime >= editState.trim.end) {
      video.pause();
      video.currentTime = editState.trim.end;
      setCurrentTime(editState.trim.end);
      setIsPlayingSelection(false);
      return;
    }

    setCurrentTime(nextTime);
  }

  function handleStartChange(start: number): void {
    if (!editState || duration === undefined) {
      return;
    }

    const minimumDuration = Math.min(0.1, duration);
    const nextStart = clamp(start, 0, editState.trim.end - minimumDuration);

    videoRef.current?.pause();
    setIsPlayingSelection(false);
    setEditState({
      ...editState,
      trim: { ...editState.trim, start: nextStart },
    });
    seekVideo(nextStart);
  }

  function handleEndChange(end: number): void {
    if (!editState || duration === undefined) {
      return;
    }

    const minimumDuration = Math.min(0.1, duration);
    const nextEnd = clamp(end, editState.trim.start + minimumDuration, duration);

    videoRef.current?.pause();
    setIsPlayingSelection(false);
    setEditState({
      ...editState,
      trim: { ...editState.trim, end: nextEnd },
    });
  }

  function handleResetSelection(): void {
    if (duration === undefined) {
      return;
    }

    videoRef.current?.pause();
    setIsPlayingSelection(false);
    setEditState({ assetId, trim: { start: 0, end: duration } });
    seekVideo(0);
  }

  function handlePlaySelection(): void {
    const video = videoRef.current;

    if (!video || !editState) {
      return;
    }

    video.currentTime = editState.trim.start;
    setCurrentTime(editState.trim.start);
    setIsPlayingSelection(true);
    void video.play().catch(() => {
      setIsPlayingSelection(false);
      setPreviewState((currentState) => ({
        ...currentState,
        phase: 'playback-error',
        errorMessage: 'Video không thể phát đoạn đã chọn.',
      }));
    });
  }

  const hasError = previewState.phase === 'url-error' || previewState.phase === 'playback-error';

  return (
    <section className="preview-panel" aria-labelledby="preview-heading">
      <div className="preview-heading-group">
        <div>
          <p className="section-label">Xem trước video</p>
          <h3 id="preview-heading">Video nguồn</h3>
        </div>
        <span className={`preview-status preview-status-${previewState.phase}`} role="status">
          {previewLabels[previewState.phase]}
        </span>
      </div>

      {previewState.playbackUrl ? (
        <video
          ref={videoRef}
          className="video-preview"
          src={previewState.playbackUrl}
          controls
          crossOrigin="anonymous"
          playsInline
          preload="metadata"
          onLoadedMetadata={handleMetadataLoaded}
          onError={handlePlaybackError}
          onPause={() => setIsPlayingSelection(false)}
          onSeeked={handleTimeUpdate}
          onTimeUpdate={handleTimeUpdate}
        >
          Trình duyệt của bạn không hỗ trợ phát video HTML5.
        </video>
      ) : null}

      {duration !== undefined ? (
        <p className="video-duration">Tổng thời lượng: {formatTimelineTime(duration)}</p>
      ) : null}

      {duration !== undefined && editState ? (
        <>
          <VideoTrimTimeline
            currentTime={currentTime}
            duration={duration}
            isPlayingSelection={isPlayingSelection}
            minimumDuration={Math.min(0.1, duration)}
            trim={editState.trim}
            onEndChange={handleEndChange}
            onPlaySelection={handlePlaySelection}
            onReset={handleResetSelection}
            onSeek={seekVideo}
            onStartChange={handleStartChange}
          />
          <VideoExport assetId={editState.assetId} trim={editState.trim} />
        </>
      ) : null}

      {hasError ? (
        <p className="upload-message upload-message-error">{previewState.errorMessage}</p>
      ) : null}
    </section>
  );
}
