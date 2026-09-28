import { formatMediaDuration, type LocalMediaItem } from '../lib/local-media';
import { getTimelineClipDuration, type TimelineClip } from '../lib/timeline';
import type { EditorDragData } from '../lib/editor-dnd';

interface EditorDragOverlayProps {
  dragData: EditorDragData | null;
  mediaItems: LocalMediaItem[];
  timelineClips: TimelineClip[];
}

function OverlayThumbnail({ media }: { media: LocalMediaItem }) {
  return (
    <span
      className="drag-overlay-thumbnail"
      style={media.thumbnailUrl ? { backgroundImage: `url(${media.thumbnailUrl})` } : undefined}
      aria-hidden="true"
    />
  );
}

export function EditorDragOverlay({ dragData, mediaItems, timelineClips }: EditorDragOverlayProps) {
  if (!dragData) {
    return null;
  }

  const mediaId =
    dragData.type === 'media'
      ? dragData.mediaId
      : timelineClips.find((clip) => clip.id === dragData.clipId)?.mediaId;
  const media = mediaItems.find((item) => item.id === mediaId);

  if (!media) {
    return null;
  }

  const timelineClip =
    dragData.type === 'timeline-clip'
      ? timelineClips.find((clip) => clip.id === dragData.clipId)
      : null;
  const duration = timelineClip ? getTimelineClipDuration(timelineClip) : media.duration;

  return (
    <div className={`editor-drag-overlay editor-drag-overlay-${dragData.type}`}>
      <OverlayThumbnail media={media} />
      <span className="drag-overlay-copy">
        <strong>{media.file.name}</strong>
        <span>{formatMediaDuration(duration)}</span>
      </span>
    </div>
  );
}
