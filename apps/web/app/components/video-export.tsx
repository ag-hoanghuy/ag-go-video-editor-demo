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
  renderId?: string;
  outputKey?: string;
  playbackUrl?: string;
  errorMessage?: string;
}

const exportLabels: Record<ExportPhase, string> = {
  idle: 'Chưa export',
  rendering: 'Đang render',
  'preparing-output': 'Đang chuẩn bị output',
  success: 'Render thành công',
  'render-error': 'Render thất bại',
  'url-error': 'Không thể lấy playback URL',
  'playback-error': 'Video output không thể phát',
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
          errorMessage: getErrorMessage(error, 'Không thể render video đã chọn.'),
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
      renderId: render.renderId,
      outputKey: render.outputKey,
    });

    try {
      const playback = await requestRenderPlaybackUrl(render.renderId, controller.signal);

      setExportState({
        phase: 'success',
        requestedTrim,
        renderId: render.renderId,
        outputKey: render.outputKey,
        playbackUrl: playback.playbackUrl,
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setExportState({
          phase: 'url-error',
          requestedTrim,
          renderId: render.renderId,
          outputKey: render.outputKey,
          errorMessage: getErrorMessage(
            error,
            'Render đã hoàn tất nhưng không thể lấy playback URL của output.',
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
      errorMessage:
        'Video đã export không thể phát. Hãy kiểm tra object trên R2, thời hạn URL và cấu hình CORS.',
    }));
  }

  const hasCurrentOutput = exportState.playbackUrl !== undefined && !isOutputStale;

  return (
    <section className="export-panel" aria-labelledby="export-heading">
      <div className="export-heading-group">
        <div>
          <p className="section-label">FFmpeg export</p>
          <h4 id="export-heading">Xuất đoạn video đã chọn</h4>
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
        Đoạn {formatTimelineTime(trim.start)} → {formatTimelineTime(trim.end)} sẽ được render đồng
        bộ trên backend.
      </p>

      <button
        type="button"
        className="export-button"
        disabled={isBusy}
        onClick={() => void handleExport()}
      >
        {isBusy
          ? 'Đang render video...'
          : isOutputStale
            ? 'Export lại vùng chọn mới'
            : 'Export video'}
      </button>

      {exportState.phase === 'rendering' ? (
        <p className="export-message" role="status">
          Backend đang tải source, kiểm tra duration và render video. Vui lòng chờ...
        </p>
      ) : null}

      {exportState.phase === 'preparing-output' ? (
        <p className="export-message" role="status">
          Render đã hoàn tất. Đang lấy playback URL của output...
        </p>
      ) : null}

      {isOutputStale ? (
        <p className="export-message export-message-warning" role="status">
          Vùng trim đã thay đổi. Kết quả cũ không còn đại diện cho vùng chọn hiện tại; hãy export
          lại để xem output mới.
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

          <dl className="export-details">
            <div>
              <dt>Render ID</dt>
              <dd>{exportState.renderId}</dd>
            </div>
            <div>
              <dt>Output key</dt>
              <dd>{exportState.outputKey}</dd>
            </div>
          </dl>

          <a
            className="download-output"
            href={exportState.playbackUrl}
            download={`video-export-${exportState.renderId}.mp4`}
            target="_blank"
            rel="noreferrer"
          >
            Tải video đã export
          </a>
        </div>
      ) : null}
    </section>
  );
}
