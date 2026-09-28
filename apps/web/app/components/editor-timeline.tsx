import { useDroppable } from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { TimelineFilmstrip } from './timeline-filmstrip';
import { TimelinePlayhead } from './timeline-playhead';
import { TimelineTrimHandle } from './timeline-trim-handle';
import { getTimelineClipDndId, timelineTrackDndId, type EditorDragData } from '../lib/editor-dnd';
import type { FilmstripFrameManager } from '../lib/filmstrip-frame-manager';
import { formatMediaDuration, type LocalMediaItem } from '../lib/local-media';
import {
  formatTimelineTime,
  getTimelineClipDuration,
  getTimelineClipWidth,
  getTimelineContentXFromTime,
  getTimelineDuration,
  getTimelineRulerMarks,
  getTimelineTimeFromContentX,
  getTimelineVisualWidth,
  type TimelineClip,
  type TimelineTrimEdge,
} from '../lib/timeline';

interface EditorTimelineProps {
  clips: TimelineClip[];
  mediaItems: LocalMediaItem[];
  selectedClipId: string | null;
  mediaDropIndex: number | null;
  filmstripManager: FilmstripFrameManager;
  currentTimelineTime: number;
  canPlay: boolean;
  canDeleteSelectedClip: boolean;
  canRedo: boolean;
  canSplitSelectedClip: boolean;
  canUndo: boolean;
  isPlaying: boolean;
  onDeleteSelectedClip: () => void;
  onRedo: () => void;
  onSeek: (time: number) => void;
  onSelectClip: (clip: TimelineClip) => void;
  onSplitSelectedClip: () => void;
  onTrimCancel: () => void;
  onTrimCommit: () => void;
  onTrimClip: (
    clipId: string,
    edge: TimelineTrimEdge,
    requestedSourceTime: number,
    mediaDuration: number,
  ) => void;
  onTrimStart: (clip: TimelineClip) => void;
  onTogglePlayback: () => void;
  onUndo: () => void;
}

interface TimelineClipVisualProps {
  clip: TimelineClip;
  clipWidth: number;
  filmstripManager: FilmstripFrameManager;
  media: LocalMediaItem;
  isSelected?: boolean;
  scrollRoot: HTMLDivElement | null;
}

const emptyTimelineDuration = 25;
const minimumTimelineContentWidth = 620;

function TimelineClipVisual({
  clip,
  clipWidth,
  filmstripManager,
  media,
  isSelected = false,
  scrollRoot,
}: TimelineClipVisualProps) {
  return (
    <div className={`timeline-clip-visual${isSelected ? ' timeline-clip-selected' : ''}`}>
      <TimelineFilmstrip
        clip={clip}
        clipWidth={clipWidth}
        media={media}
        manager={filmstripManager}
        scrollRoot={scrollRoot}
      />
      <div className="timeline-clip-copy">
        <strong>{media.file.name}</strong>
        <span>{formatMediaDuration(getTimelineClipDuration(clip))}</span>
      </div>
    </div>
  );
}

function SortableTimelineClip({
  clip,
  filmstripManager,
  media,
  isSelected,
  onSelect,
  onTrimCancel,
  onTrimCommit,
  onTrim,
  onTrimStart,
  scrollRoot,
}: {
  clip: TimelineClip;
  filmstripManager: FilmstripFrameManager;
  media: LocalMediaItem;
  isSelected: boolean;
  onSelect: (clip: TimelineClip) => void;
  onTrimCancel: EditorTimelineProps['onTrimCancel'];
  onTrimCommit: EditorTimelineProps['onTrimCommit'];
  onTrim: EditorTimelineProps['onTrimClip'];
  onTrimStart: EditorTimelineProps['onTrimStart'];
  scrollRoot: HTMLDivElement | null;
}) {
  const dragData = { type: 'timeline-clip', clipId: clip.id } satisfies EditorDragData;
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: getTimelineClipDndId(clip.id),
    data: dragData,
  });
  const clipWidth = getTimelineClipWidth(clip);
  const style: CSSProperties = {
    width: clipWidth,
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      className={`timeline-clip${isSelected ? ' timeline-clip-selected-container' : ''}${isDragging ? ' timeline-clip-dragging' : ''}`}
      style={style}
      aria-label={`${media.file.name}, ${formatMediaDuration(getTimelineClipDuration(clip))}`}
      onClick={() => onSelect(clip)}
      {...attributes}
      {...listeners}
    >
      <TimelineClipVisual
        clip={clip}
        clipWidth={clipWidth}
        filmstripManager={filmstripManager}
        media={media}
        isSelected={isSelected}
        scrollRoot={scrollRoot}
      />
      <TimelineTrimHandle
        clip={clip}
        edge="start"
        mediaDuration={media.duration ?? clip.trimEnd}
        onTrimCancel={onTrimCancel}
        onTrimCommit={onTrimCommit}
        onTrimStart={onTrimStart}
        onTrim={onTrim}
      />
      <TimelineTrimHandle
        clip={clip}
        edge="end"
        mediaDuration={media.duration ?? clip.trimEnd}
        onTrimCancel={onTrimCancel}
        onTrimCommit={onTrimCommit}
        onTrimStart={onTrimStart}
        onTrim={onTrim}
      />
    </div>
  );
}

export function EditorTimeline({
  clips,
  mediaItems,
  selectedClipId,
  mediaDropIndex,
  filmstripManager,
  currentTimelineTime,
  canPlay,
  canDeleteSelectedClip,
  canRedo,
  canSplitSelectedClip,
  canUndo,
  isPlaying,
  onDeleteSelectedClip,
  onRedo,
  onSeek,
  onSelectClip,
  onSplitSelectedClip,
  onTrimCancel,
  onTrimCommit,
  onTrimClip,
  onTrimStart,
  onTogglePlayback,
  onUndo,
}: EditorTimelineProps) {
  const { isOver, setNodeRef } = useDroppable({ id: timelineTrackDndId });
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const mediaById = useMemo(
    () => new Map(mediaItems.map((media) => [media.id, media])),
    [mediaItems],
  );
  const timelineDuration = getTimelineDuration(clips);
  const rulerDuration = timelineDuration > 0 ? timelineDuration : emptyTimelineDuration;
  const rulerMarks = getTimelineRulerMarks(rulerDuration);
  const clipsWidth = getTimelineVisualWidth(clips);
  const timelineWidth = Math.max(minimumTimelineContentWidth, clipsWidth);
  const playheadX = getTimelineContentXFromTime(currentTimelineTime, timelineDuration);
  const insertionOffset =
    mediaDropIndex === null
      ? null
      : getTimelineVisualWidth(clips.slice(0, Math.min(Math.max(0, mediaDropIndex), clips.length)));

  const getTimeAtClientX = (clientX: number): number => {
    const content = scrollContentRef.current;

    if (!scrollRoot || !content || timelineDuration <= 0) {
      return 0;
    }

    const viewportRectangle = scrollRoot.getBoundingClientRect();
    const contentRectangle = content.getBoundingClientRect();
    const contentOriginOffset =
      contentRectangle.left - viewportRectangle.left + scrollRoot.scrollLeft;
    const contentX = clientX - viewportRectangle.left + scrollRoot.scrollLeft - contentOriginOffset;

    return getTimelineTimeFromContentX(contentX, timelineDuration);
  };

  const handleTimelineClick = (event: MouseEvent<HTMLDivElement>) => {
    if (timelineDuration > 0) {
      onSeek(getTimeAtClientX(event.clientX));
    }
  };

  return (
    <section className="timeline-shell" aria-label="Dòng thời gian">
      <div className="timeline-toolbar-shell">
        <strong>Dòng thời gian</strong>
        <div className="timeline-actions-shell">
          <button
            className={isPlaying ? 'timeline-playback-button-active' : undefined}
            type="button"
            disabled={!canPlay}
            aria-pressed={isPlaying}
            onClick={onTogglePlayback}
          >
            <span aria-hidden="true">{isPlaying ? '❚❚' : '▶'}</span>
            {isPlaying ? 'Tạm dừng' : 'Phát'}
          </button>
          <button
            type="button"
            disabled={!canUndo}
            aria-keyshortcuts="Control+Z Meta+Z"
            onClick={onUndo}
          >
            <span aria-hidden="true">↶</span>
            Hoàn tác
          </button>
          <button
            type="button"
            disabled={!canRedo}
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
            onClick={onRedo}
          >
            <span aria-hidden="true">↷</span>
            Làm lại
          </button>
          <button type="button" disabled={!canSplitSelectedClip} onClick={onSplitSelectedClip}>
            <span aria-hidden="true">✂</span>
            Tách
          </button>
          <button type="button" disabled={!canDeleteSelectedClip} onClick={onDeleteSelectedClip}>
            <span aria-hidden="true">⌫</span>
            Xóa
          </button>
        </div>
        <span className="timeline-phase-badge">
          {formatTimelineTime(currentTimelineTime)} / {formatTimelineTime(timelineDuration)}
        </span>
      </div>

      <div className="timeline-content-shell">
        <div className="timeline-track-label">
          <span aria-hidden="true">▣</span>
          <strong>Video 1</strong>
        </div>
        <div ref={setScrollRoot} className="timeline-scroll-area">
          <div
            ref={scrollContentRef}
            className="timeline-scroll-content"
            style={{ width: timelineWidth }}
            onClick={handleTimelineClick}
          >
            <div className="timeline-ruler" aria-hidden="true">
              {rulerMarks.map((time) => (
                <span key={time} style={{ left: getTimelineContentXFromTime(time, rulerDuration) }}>
                  {formatMediaDuration(time)}
                </span>
              ))}
            </div>
            <div
              ref={setNodeRef}
              className={`timeline-track-surface${isOver ? ' timeline-track-surface-over' : ''}`}
            >
              {clips.length > 0 ? (
                <SortableContext
                  items={clips.map((clip) => getTimelineClipDndId(clip.id))}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="timeline-clips" role="list">
                    {clips.map((clip) => {
                      const media = mediaById.get(clip.mediaId);

                      return media ? (
                        <SortableTimelineClip
                          key={clip.id}
                          clip={clip}
                          filmstripManager={filmstripManager}
                          media={media}
                          isSelected={clip.id === selectedClipId}
                          onSelect={onSelectClip}
                          onTrimCancel={onTrimCancel}
                          onTrimCommit={onTrimCommit}
                          onTrim={onTrimClip}
                          onTrimStart={onTrimStart}
                          scrollRoot={scrollRoot}
                        />
                      ) : null;
                    })}
                  </div>
                </SortableContext>
              ) : (
                <div className="empty-video-track">
                  <span aria-hidden="true">＋</span>
                  <div>
                    <strong>Kéo video từ Thư viện xuống đây để bắt đầu.</strong>
                    <p>Video sẽ được nối liền nhau theo thứ tự thả.</p>
                  </div>
                </div>
              )}
              {insertionOffset !== null ? (
                <span
                  className="timeline-drop-indicator"
                  style={{ left: insertionOffset }}
                  aria-hidden="true"
                />
              ) : null}
            </div>
            {clips.length > 0 ? (
              <TimelinePlayhead
                currentTime={currentTimelineTime}
                positionX={playheadX}
                onScrubClientX={(clientX) => onSeek(getTimeAtClientX(clientX))}
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
