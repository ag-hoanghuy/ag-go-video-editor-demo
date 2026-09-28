export type EditorDragData =
  | {
      type: 'media';
      mediaId: string;
    }
  | {
      type: 'timeline-clip';
      clipId: string;
    };

export const timelineTrackDndId = 'timeline-track';

export function getMediaDndId(mediaId: string): string {
  return `media:${mediaId}`;
}

export function getTimelineClipDndId(clipId: string): string {
  return `timeline-clip:${clipId}`;
}

export function readEditorDragData(value: unknown): EditorDragData | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  if ('type' in value && value.type === 'media' && 'mediaId' in value) {
    return typeof value.mediaId === 'string' ? { type: 'media', mediaId: value.mediaId } : null;
  }

  if ('type' in value && value.type === 'timeline-clip' && 'clipId' in value) {
    return typeof value.clipId === 'string'
      ? { type: 'timeline-clip', clipId: value.clipId }
      : null;
  }

  return null;
}
