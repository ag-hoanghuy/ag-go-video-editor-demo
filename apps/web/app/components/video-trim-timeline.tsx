'use client';

import type { VideoTrimInstruction } from '@ag-go-video-editor/shared';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useRef } from 'react';

export type TrimSelection = VideoTrimInstruction;

interface VideoTrimTimelineProps {
  currentTime: number;
  duration: number;
  isPlayingSelection: boolean;
  minimumDuration: number;
  trim: TrimSelection;
  onEndChange: (end: number) => void;
  onPlaySelection: () => void;
  onReset: () => void;
  onSeek: (time: number) => void;
  onStartChange: (start: number) => void;
}

type TrimBoundary = 'start' | 'end';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function formatTimelineTime(time: number): string {
  const normalizedTime = Math.max(0, Math.round(time * 10) / 10);
  const hours = Math.floor(normalizedTime / 3600);
  const minutes = Math.floor((normalizedTime % 3600) / 60);
  const seconds = (normalizedTime % 60).toFixed(1).padStart(4, '0');

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds}`;
  }

  return `${minutes}:${seconds}`;
}

export function VideoTrimTimeline({
  currentTime,
  duration,
  isPlayingSelection,
  minimumDuration,
  trim,
  onEndChange,
  onPlaySelection,
  onReset,
  onSeek,
  onStartChange,
}: VideoTrimTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const startPercent = (trim.start / duration) * 100;
  const endPercent = (trim.end / duration) * 100;
  const playheadPercent = (clamp(currentTime, 0, duration) / duration) * 100;

  function getTimeAtPointer(clientX: number): number {
    const timeline = timelineRef.current;

    if (!timeline) {
      return currentTime;
    }

    const bounds = timeline.getBoundingClientRect();

    if (bounds.width === 0) {
      return currentTime;
    }

    return clamp(((clientX - bounds.left) / bounds.width) * duration, 0, duration);
  }

  function changeBoundary(boundary: TrimBoundary, time: number): void {
    if (boundary === 'start') {
      onStartChange(time);
      return;
    }

    onEndChange(time);
  }

  function handleBoundaryPointerDown(
    boundary: TrimBoundary,
    event: PointerEvent<HTMLButtonElement>,
  ): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    changeBoundary(boundary, getTimeAtPointer(event.clientX));
  }

  function handleBoundaryPointerMove(
    boundary: TrimBoundary,
    event: PointerEvent<HTMLButtonElement>,
  ): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      changeBoundary(boundary, getTimeAtPointer(event.clientX));
    }
  }

  function handleBoundaryKeyDown(
    boundary: TrimBoundary,
    event: KeyboardEvent<HTMLButtonElement>,
  ): void {
    const increment = event.shiftKey ? 1 : 0.1;
    const value = boundary === 'start' ? trim.start : trim.end;
    let nextValue: number | undefined;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      nextValue = value - increment;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      nextValue = value + increment;
    } else if (event.key === 'Home') {
      nextValue = boundary === 'start' ? 0 : trim.start + minimumDuration;
    } else if (event.key === 'End') {
      nextValue = boundary === 'start' ? trim.end - minimumDuration : duration;
    }

    if (nextValue !== undefined) {
      event.preventDefault();
      changeBoundary(boundary, nextValue);
    }
  }

  function handleSeekPointerDown(event: PointerEvent<HTMLButtonElement>): void {
    onSeek(getTimeAtPointer(event.clientX));
  }

  function handleSeekKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    const increment = event.shiftKey ? 5 : 1;
    let nextTime: number | undefined;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      nextTime = currentTime - increment;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      nextTime = currentTime + increment;
    } else if (event.key === 'Home') {
      nextTime = 0;
    } else if (event.key === 'End') {
      nextTime = duration;
    }

    if (nextTime !== undefined) {
      event.preventDefault();
      onSeek(clamp(nextTime, 0, duration));
    }
  }

  return (
    <section className="trim-editor" aria-labelledby="trim-heading">
      <div className="timeline-heading">
        <h4 id="trim-heading">Timeline cắt video</h4>
        <span>
          {formatTimelineTime(currentTime)} / {formatTimelineTime(duration)}
        </span>
      </div>

      <div className="trim-timeline" ref={timelineRef}>
        <button
          type="button"
          className="timeline-track"
          aria-label="Tua video trên timeline"
          onPointerDown={handleSeekPointerDown}
          onKeyDown={handleSeekKeyDown}
        >
          <span
            className="timeline-selection"
            style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
          />
          <span className="timeline-playhead" style={{ left: `${playheadPercent}%` }} />
        </button>

        <button
          type="button"
          className="timeline-handle timeline-handle-start"
          style={{ left: `${startPercent}%` }}
          role="slider"
          aria-label="Mốc bắt đầu"
          aria-valuemin={0}
          aria-valuemax={trim.end - minimumDuration}
          aria-valuenow={trim.start}
          aria-valuetext={formatTimelineTime(trim.start)}
          onPointerDown={(event) => handleBoundaryPointerDown('start', event)}
          onPointerMove={(event) => handleBoundaryPointerMove('start', event)}
          onKeyDown={(event) => handleBoundaryKeyDown('start', event)}
        />
        <button
          type="button"
          className="timeline-handle timeline-handle-end"
          style={{ left: `${endPercent}%` }}
          role="slider"
          aria-label="Mốc kết thúc"
          aria-valuemin={trim.start + minimumDuration}
          aria-valuemax={duration}
          aria-valuenow={trim.end}
          aria-valuetext={formatTimelineTime(trim.end)}
          onPointerDown={(event) => handleBoundaryPointerDown('end', event)}
          onPointerMove={(event) => handleBoundaryPointerMove('end', event)}
          onKeyDown={(event) => handleBoundaryKeyDown('end', event)}
        />
      </div>

      <div className="timeline-scale" aria-hidden="true">
        <span>0:00.0</span>
        <span>{formatTimelineTime(duration)}</span>
      </div>

      <div className="timeline-legend" aria-hidden="true">
        <span>
          <i className="legend-swatch legend-selection" /> Vùng được chọn
        </span>
        <span>
          <i className="legend-swatch legend-start" /> Mốc bắt đầu
        </span>
        <span>
          <i className="legend-swatch legend-end" /> Mốc kết thúc
        </span>
        <span>
          <i className="legend-swatch legend-playhead" /> Vị trí phát
        </span>
      </div>

      <dl className="trim-details">
        <div>
          <dt>Thời gian bắt đầu</dt>
          <dd>{formatTimelineTime(trim.start)}</dd>
        </div>
        <div>
          <dt>Thời gian kết thúc</dt>
          <dd>{formatTimelineTime(trim.end)}</dd>
        </div>
        <div>
          <dt>Thời lượng đã chọn</dt>
          <dd>{formatTimelineTime(trim.end - trim.start)}</dd>
        </div>
      </dl>

      <div className="trim-actions">
        <button type="button" className="trim-action-primary" onClick={onPlaySelection}>
          {isPlayingSelection ? 'Đang phát đoạn đã chọn...' : 'Phát đoạn đã chọn'}
        </button>
        <button type="button" className="trim-action-secondary" onClick={onReset}>
          Đặt lại vùng chọn
        </button>
      </div>
    </section>
  );
}
