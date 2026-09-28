import {
  clampTimelineTime,
  getTimelineClipDuration,
  getTimelineClipStart,
  getTimelineDuration,
  getTimelinePositionAtTime,
  type TimelineClip,
  type TimelinePosition,
} from './timeline';

export interface TimelinePlaybackClipPosition {
  clip: TimelineClip;
  clipIndex: number;
  clipStart: number;
  clipEnd: number;
}

export interface TimelinePlaybackPosition extends TimelinePosition {
  timelineTime: number;
  timelineDuration: number;
  isAtTimelineEnd: boolean;
}

const playbackBoundaryEpsilon = 0.001;

export function getTimelinePlaybackPosition(
  clips: TimelineClip[],
  globalTime: number,
  mediaDurations?: ReadonlyMap<string, number | null>,
): TimelinePlaybackPosition | null {
  const timelineDuration = getTimelineDuration(clips);
  const position = getTimelinePositionAtTime(clips, globalTime, mediaDurations);

  if (!position) {
    return null;
  }

  const timelineTime = clampTimelineTime(globalTime, timelineDuration);

  return {
    ...position,
    timelineTime,
    timelineDuration,
    isAtTimelineEnd: timelineTime >= timelineDuration,
  };
}

export function getNextTimelinePlaybackPosition(
  clips: TimelineClip[],
  clipIndex: number,
): TimelinePlaybackClipPosition | null {
  for (let nextClipIndex = clipIndex + 1; nextClipIndex < clips.length; nextClipIndex += 1) {
    const clip = clips[nextClipIndex];

    if (!clip) {
      continue;
    }

    const clipDuration = getTimelineClipDuration(clip);

    if (clipDuration <= 0) {
      continue;
    }

    const clipStart = getTimelineClipStart(clips, nextClipIndex);

    return {
      clip,
      clipIndex: nextClipIndex,
      clipStart,
      clipEnd: clipStart + clipDuration,
    };
  }

  return null;
}

export function getTimelineTimeFromPlaybackSource(
  clips: TimelineClip[],
  clipIndex: number,
  sourceTime: number,
): number {
  const clip = clips[clipIndex];

  if (!clip) {
    return 0;
  }

  const clipDuration = getTimelineClipDuration(clip);
  const clipStart = getTimelineClipStart(clips, clipIndex);
  const safeSourceTime = Number.isFinite(sourceTime) ? sourceTime : clip.trimStart;
  const localOffset = Math.min(Math.max(safeSourceTime - clip.trimStart, 0), clipDuration);

  return clampTimelineTime(clipStart + localOffset, getTimelineDuration(clips));
}

export function hasReachedTimelineClipEnd(clip: TimelineClip, sourceTime: number): boolean {
  return Number.isFinite(sourceTime) && sourceTime + playbackBoundaryEpsilon >= clip.trimEnd;
}
