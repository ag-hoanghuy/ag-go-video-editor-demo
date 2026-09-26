'use client';

import type { CreateRenderResponse, VideoTrimInstruction } from '@ag-go-video-editor/shared';
import { useEffect, useRef, useState } from 'react';
import { requestRender, requestRenderPlaybackUrl } from '../lib/renders-api';
import { formatTimelineTime } from './video-trim-timeline';

type ExportPhase =
  | 'idle'
  | 'rendering'
  | 'preparing-output'
  | 'success'
  | 'render-error'
  | 'url-error'
  | 'playback-error';

interface VideoExportProps {
  assetId: string;
  trim: VideoTrimInstruction;
}

interface ExportState {
  phase: ExportPhase;
  requestedTrim?: VideoTrimInstruction;
  playbackUrl?: string;
  errorMessage?: string;
}

const exportLabels: Record<ExportPhase, string> = {
  idle: 'Chưa xuất video',
  rendering: 'Đang xuất video',
  'preparing-output': 'Đang chuẩn bị video',
  success: 'Video đã xuất xong',
  'render-error': 'Xuất video thất bại',
  'url-error': 'Không thể tải video đã xuất',
  'playback-error': 'Video đã xuất không thể phát',
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isSameTrim(first: VideoTrimInstruction, second: VideoTrimInstruction): boolean {
  return first.start === second.start && first.end === second.end;
}

export function VideoExport({ assetId, trim }: VideoExportProps) {
  const requestControllerRef = useRef<AbortController>(null);
  const [exportState, setExportState] = useState<ExportState>({ phase: 'idle' });
  const isBusy = exportState.phase === 'rendering' || exportState.phase === 'preparing-output';
  const isOutputStale =
    exportState.playbackUrl !== undefined &&
    exportState.requestedTrim !== undefined &&
    !isSameTrim(exportState.requestedTrim, trim);

  useEffect(
    () => () => {
      requestControllerRef.current?.abort();
    },
    [],
  );

  async function handleExport(): Promise<void> {
    if (isBusy) {
      return;
    }

    const controller = new AbortController();
    const requestedTrim = { ...trim };
    requestControllerRef.current = controller;
    setExportState({ phase: 'rendering', requestedTrim });

    let render: CreateRenderResponse;

    try {
      render = await requestRender({ assetId, trim: requestedTrim }, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        setExportState({
          phase: 'render-error',
          requestedTrim,
          errorMessage: getErrorMessage(error, 'Không thể xuất video đã chọn.'),
        });
      }
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      return;
    }

    if (controller.signal.aborted) {
      return;
    }

    setExportState({
      phase: 'preparing-output',
      requestedTrim,
    });

    try {
      const playback = await requestRenderPlaybackUrl(render.renderId, controller.signal);

      setExportState({
        phase: 'success',
        requestedTrim,
        playbackUrl: playback.playbackUrl,
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setExportState({
          phase: 'url-error',
          requestedTrim,
          errorMessage: getErrorMessage(
            error,
            'Video đã được xuất nhưng không thể chuẩn bị để xem trước.',
          ),
        });
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
    }
  }

  function handlePlaybackError(): void {
    setExportState((currentState) => ({
      ...currentState,
      phase: 'playback-error',
      errorMessage: 'Video đã xuất không thể phát. Hãy kiểm tra kết nối và thử lại.',
    }));
  }

  const hasExportedOutput = exportState.playbackUrl !== undefined;
  const hasCurrentOutput = hasExportedOutput && !isOutputStale;

  return (
    <section className="export-panel" aria-labelledby="export-heading">
      <div className="export-heading-group">
        <div>
          <p className="section-label">Xuất video</p>
          <h4 id="export-heading">Tạo video từ vùng đã chọn</h4>
        </div>
        <span
          className={`export-status ${
            isOutputStale ? 'export-status-stale' : `export-status-${exportState.phase}`
          }`}
          role="status"
        >
          {isOutputStale ? 'Cần export lại' : exportLabels[exportState.phase]}
        </span>
      </div>

      <p className="export-description">
        Đoạn {formatTimelineTime(trim.start)} → {formatTimelineTime(trim.end)} sẽ được dùng để tạo
        video mới.
      </p>

      <button
        type="button"
        className="export-button"
        disabled={isBusy}
        onClick={() => void handleExport()}
      >
        {isBusy
          ? 'Đang xuất video...'
          : isOutputStale
            ? 'Export vùng chọn mới'
            : hasExportedOutput
              ? 'Export lại video'
              : 'Export video'}
      </button>

      {exportState.phase === 'rendering' ? (
        <p className="export-message" role="status">
          Đang tạo video từ vùng đã chọn. Vui lòng chờ...
        </p>
      ) : null}

      {exportState.phase === 'preparing-output' ? (
        <p className="export-message" role="status">
          Video đã được tạo. Đang chuẩn bị xem trước...
        </p>
      ) : null}

      {isOutputStale ? (
        <p className="export-message export-message-warning" role="status">
          Vùng trim đã thay đổi. Video đã xuất trước đó không còn khớp với vùng chọn hiện tại; hãy
          export lại để xem kết quả mới.
        </p>
      ) : null}

      {exportState.errorMessage && !isOutputStale ? (
        <p className="export-message export-message-error" role="alert">
          {exportState.errorMessage}
        </p>
      ) : null}

      {hasCurrentOutput ? (
        <div className="export-output">
          <video
            className="video-preview export-video"
            src={exportState.playbackUrl}
            controls
            crossOrigin="anonymous"
            playsInline
            preload="metadata"
            onError={handlePlaybackError}
          >
            Trình duyệt của bạn không hỗ trợ phát video HTML5.
          </video>

          <a
            className="download-output"
            href={exportState.playbackUrl}
            download="video-da-xuat.mp4"
            target="_blank"
            rel="noreferrer"
          >
            Tải video
          </a>
        </div>
      ) : null}
    </section>
  );
}
