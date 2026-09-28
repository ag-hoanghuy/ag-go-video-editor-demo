import { useDroppable } from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, type CSSProperties } from 'react';
import { getTimelineClipDndId, timelineTrackDndId, type EditorDragData } from '../lib/editor-dnd';
import { formatMediaDuration, type LocalMediaItem } from '../lib/local-media';
import {
  getTimelineClipDuration,
  getTimelineClipWidth,
  getTimelineDuration,
  getTimelineRulerMarks,
  getTimelineVisualWidth,
  type TimelineClip,
} from '../lib/timeline';

interface EditorTimelineProps {
  clips: TimelineClip[];
  mediaItems: LocalMediaItem[];
  selectedClipId: string | null;
  mediaDropIndex: number | null;
  onSelectClip: (clip: TimelineClip) => void;
}

interface TimelineClipVisualProps {
  clip: TimelineClip;
  media: LocalMediaItem;
  isSelected?: boolean;
}

const emptyTimelineDuration = 25;
const minimumTimelineContentWidth = 620;

function TimelineClipVisual({ clip, media, isSelected = false }: TimelineClipVisualProps) {
  return (
    <div className={`timeline-clip-visual${isSelected ? ' timeline-clip-selected' : ''}`}>
      <div
        className="timeline-clip-thumbnail"
        role="img"
        aria-label={`Ảnh xem trước của ${media.file.name}`}
        style={media.thumbnailUrl ? { backgroundImage: `url(${media.thumbnailUrl})` } : undefined}
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
  media,
  isSelected,
  onSelect,
}: {
  clip: TimelineClip;
  media: LocalMediaItem;
  isSelected: boolean;
  onSelect: (clip: TimelineClip) => void;
}) {
  const dragData = { type: 'timeline-clip', clipId: clip.id } satisfies EditorDragData;
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: getTimelineClipDndId(clip.id),
    data: dragData,
  });
  const style: CSSProperties = {
    width: getTimelineClipWidth(clip),
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      className={`timeline-clip${isDragging ? ' timeline-clip-dragging' : ''}`}
      type="button"
      style={style}
      onClick={() => onSelect(clip)}
      {...attributes}
      {...listeners}
    >
      <TimelineClipVisual clip={clip} media={media} isSelected={isSelected} />
    </button>
  );
}

export function EditorTimeline({
  clips,
  mediaItems,
  selectedClipId,
  mediaDropIndex,
  onSelectClip,
}: EditorTimelineProps) {
  const { isOver, setNodeRef } = useDroppable({ id: timelineTrackDndId });
  const mediaById = useMemo(
    () => new Map(mediaItems.map((media) => [media.id, media])),
    [mediaItems],
  );
  const timelineDuration = getTimelineDuration(clips);
  const rulerDuration = timelineDuration > 0 ? timelineDuration : emptyTimelineDuration;
  const rulerMarks = getTimelineRulerMarks(rulerDuration);
  const clipsWidth = getTimelineVisualWidth(clips);
  const timelineWidth = Math.max(minimumTimelineContentWidth, clipsWidth);
  const rulerWidth = timelineDuration > 0 ? clipsWidth : timelineWidth;
  const insertionOffset =
    mediaDropIndex === null
      ? null
      : getTimelineVisualWidth(clips.slice(0, Math.min(Math.max(0, mediaDropIndex), clips.length)));

  return (
    <section className="timeline-shell" aria-label="Dòng thời gian">
      <div className="timeline-toolbar-shell">
        <strong>Dòng thời gian</strong>
        <div className="timeline-actions-shell">
          <button type="button" disabled>
            <span aria-hidden="true">✂</span>
            Tách
          </button>
          <button type="button" disabled>
            <span aria-hidden="true">⌫</span>
            Xóa
          </button>
        </div>
        <span className="timeline-phase-badge">
          {clips.length > 0
            ? `${clips.length} clip · ${formatMediaDuration(timelineDuration)}`
            : 'Chưa có clip'}
        </span>
      </div>

      <div className="timeline-content-shell">
        <div className="timeline-track-label">
          <span aria-hidden="true">▣</span>
          <strong>Video 1</strong>
        </div>
        <div className="timeline-scroll-area">
          <div className="timeline-scroll-content" style={{ width: timelineWidth }}>
            <div className="timeline-ruler" aria-hidden="true">
              {rulerMarks.map((time) => (
                <span key={time} style={{ left: (time / rulerDuration) * rulerWidth }}>
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
                          media={media}
                          isSelected={clip.id === selectedClipId}
                          onSelect={onSelectClip}
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
          </div>
        </div>
      </div>
    </section>
  );
}
