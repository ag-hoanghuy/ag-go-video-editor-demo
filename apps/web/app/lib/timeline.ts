export interface TimelineClip {
  id: string;
  mediaId: string;
  trimStart: number;
  trimEnd: number;
}

export interface TimelinePosition {
  clip: TimelineClip;
  clipIndex: number;
  clipStart: number;
  clipEnd: number;
  localOffset: number;
  sourceTime: number;
}

export const timelinePixelsPerSecond = 20;
export const minimumTimelineClipWidth = 72;

const sourceTimeEpsilon = 0.001;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function clampTimelineTime(time: number, timelineDuration: number): number {
  if (!Number.isFinite(time) || !Number.isFinite(timelineDuration) || timelineDuration <= 0) {
    return 0;
  }

  return clamp(time, 0, timelineDuration);
}

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

export function getTimelinePositionAtTime(
  clips: TimelineClip[],
  globalTime: number,
  mediaDurations?: ReadonlyMap<string, number | null>,
): TimelinePosition | null {
  const timelineDuration = getTimelineDuration(clips);

  if (timelineDuration <= 0) {
    return null;
  }

  const safeGlobalTime = clampTimelineTime(globalTime, timelineDuration);
  let clipStart = 0;
  let lastPosition: TimelinePosition | null = null;

  for (let clipIndex = 0; clipIndex < clips.length; clipIndex += 1) {
    const clip = clips[clipIndex];

    if (!clip) {
      continue;
    }

    const clipDuration = getTimelineClipDuration(clip);

    if (clipDuration <= 0) {
      continue;
    }

    const clipEnd = clipStart + clipDuration;
    const localOffset = clamp(safeGlobalTime - clipStart, 0, clipDuration);
    const mediaDuration = mediaDurations?.get(clip.mediaId);
    const sourceLimit =
      mediaDuration !== null &&
      mediaDuration !== undefined &&
      Number.isFinite(mediaDuration) &&
      mediaDuration > 0
        ? Math.min(clip.trimEnd, mediaDuration)
        : clip.trimEnd;
    const sourceRange = Math.max(0, sourceLimit - clip.trimStart);
    const epsilon = Math.min(sourceTimeEpsilon, sourceRange / 2);
    const maximumSourceTime = Math.max(clip.trimStart, sourceLimit - epsilon);
    const sourceTime = clamp(clip.trimStart + localOffset, clip.trimStart, maximumSourceTime);
    const position = {
      clip,
      clipIndex,
      clipStart,
      clipEnd,
      localOffset,
      sourceTime,
    };

    if (safeGlobalTime < clipEnd) {
      return position;
    }

    lastPosition = position;
    clipStart = clipEnd;
  }

  return lastPosition;
}

export function getTimelineTimeFromContentX(contentX: number, timelineDuration: number): number {
  if (!Number.isFinite(contentX)) {
    return 0;
  }

  return clampTimelineTime(contentX / timelinePixelsPerSecond, timelineDuration);
}

export function getTimelineContentXFromTime(time: number, timelineDuration: number): number {
  return clampTimelineTime(time, timelineDuration) * timelinePixelsPerSecond;
}

export function formatTimelineTime(time: number): string {
  const totalCentiseconds = Math.max(0, Math.round((Number.isFinite(time) ? time : 0) * 100));
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const secondText = `${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${secondText}`;
  }

  return `${String(minutes).padStart(2, '0')}:${secondText}`;
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
