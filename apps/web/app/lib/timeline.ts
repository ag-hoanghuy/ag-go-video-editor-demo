export interface TimelineClip {
  id: string;
  mediaId: string;
  trimStart: number;
  trimEnd: number;
}

export const timelinePixelsPerSecond = 20;
export const minimumTimelineClipWidth = 72;

export function createTimelineClip(mediaId: string, duration: number | null): TimelineClip | null {
  if (duration === null || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    mediaId,
    trimStart: 0,
    trimEnd: duration,
  };
}

export function getTimelineClipDuration(clip: TimelineClip): number {
  return Math.max(0, clip.trimEnd - clip.trimStart);
}

export function getTimelineDuration(clips: TimelineClip[]): number {
  return clips.reduce((duration, clip) => duration + getTimelineClipDuration(clip), 0);
}

export function getTimelineClipStart(clips: TimelineClip[], clipIndex: number): number {
  return clips
    .slice(0, Math.max(0, clipIndex))
    .reduce((start, clip) => start + getTimelineClipDuration(clip), 0);
}

export function getTimelineClipEnd(clips: TimelineClip[], clipIndex: number): number {
  const clip = clips[clipIndex];
  return clip ? getTimelineClipStart(clips, clipIndex) + getTimelineClipDuration(clip) : 0;
}

export function getTimelineClipWidth(clip: TimelineClip): number {
  return Math.max(
    minimumTimelineClipWidth,
    getTimelineClipDuration(clip) * timelinePixelsPerSecond,
  );
}

export function getTimelineVisualWidth(clips: TimelineClip[]): number {
  return clips.reduce((width, clip) => width + getTimelineClipWidth(clip), 0);
}

export function insertTimelineClip(
  clips: TimelineClip[],
  clip: TimelineClip,
  insertionIndex: number,
): TimelineClip[] {
  const safeIndex = Math.min(Math.max(0, insertionIndex), clips.length);
  return [...clips.slice(0, safeIndex), clip, ...clips.slice(safeIndex)];
}

function getRulerInterval(duration: number): number {
  const targetInterval = duration / 5;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(targetInterval, 1)));
  const normalizedInterval = targetInterval / magnitude;

  if (normalizedInterval <= 1) {
    return magnitude;
  }

  if (normalizedInterval <= 2) {
    return magnitude * 2;
  }

  if (normalizedInterval <= 5) {
    return magnitude * 5;
  }

  return magnitude * 10;
}

export function getTimelineRulerMarks(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [0];
  }

  const interval = getRulerInterval(duration);
  const marks = [0];

  for (let time = interval; time < duration; time += interval) {
    marks.push(time);
  }

  if (marks.at(-1) !== duration) {
    marks.push(duration);
  }

  return marks;
}
