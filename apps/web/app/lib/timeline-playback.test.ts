import { describe, expect, it } from 'vitest';
import type { TimelineClip } from './timeline';
import {
  getNextTimelinePlaybackPosition,
  getTimelinePlaybackPosition,
  getTimelineTimeFromPlaybackSource,
  hasReachedTimelineClipEnd,
} from './timeline-playback';

const clips: TimelineClip[] = [
  { id: 'clip-a', mediaId: 'media-a', trimStart: 0, trimEnd: 5 },
  { id: 'clip-b', mediaId: 'media-b', trimStart: 10, trimEnd: 16 },
];

const mediaDurations = new Map<string, number | null>([
  ['media-a', 20],
  ['media-b', 30],
]);

describe('getTimelinePlaybackPosition', () => {
  it('starts playback from the middle of a clip', () => {
    const position = getTimelinePlaybackPosition(clips, 2.5, mediaDurations);

    expect(position?.clip.id).toBe('clip-a');
    expect(position?.localOffset).toBe(2.5);
    expect(position?.sourceTime).toBe(2.5);
    expect(position?.timelineTime).toBe(2.5);
  });

  it('includes trimStart when deriving source time', () => {
    const position = getTimelinePlaybackPosition(clips, 7, mediaDurations);

    expect(position?.clip.id).toBe('clip-b');
    expect(position?.localOffset).toBe(2);
    expect(position?.sourceTime).toBe(12);
  });

  it('selects the next clip at an exact boundary', () => {
    const position = getTimelinePlaybackPosition(clips, 5, mediaDurations);

    expect(position?.clip.id).toBe('clip-b');
    expect(position?.clipStart).toBe(5);
    expect(position?.sourceTime).toBe(10);
  });

  it('maps adjacent clips of the same media to their distinct trim ranges', () => {
    const sameMediaClips: TimelineClip[] = [
      { id: 'clip-a1', mediaId: 'media-a', trimStart: 0, trimEnd: 5 },
      { id: 'clip-a2', mediaId: 'media-a', trimStart: 10, trimEnd: 15 },
    ];

    expect(getTimelinePlaybackPosition(sameMediaClips, 4.9)?.sourceTime).toBeCloseTo(4.9);
    expect(getTimelinePlaybackPosition(sameMediaClips, 5)?.sourceTime).toBe(10);
  });

  it('maps the timeline end to a safe frame in the last clip', () => {
    const position = getTimelinePlaybackPosition(clips, 11, mediaDurations);

    expect(position?.clip.id).toBe('clip-b');
    expect(position?.timelineTime).toBe(11);
    expect(position?.isAtTimelineEnd).toBe(true);
    expect(position?.sourceTime).toBeCloseTo(15.999, 3);
  });

  it('returns null for an empty timeline', () => {
    expect(getTimelinePlaybackPosition([], 0)).toBeNull();
  });
});

describe('getNextTimelinePlaybackPosition', () => {
  it('returns the following clip with its global boundaries', () => {
    expect(getNextTimelinePlaybackPosition(clips, 0)).toEqual({
      clip: clips[1],
      clipIndex: 1,
      clipStart: 5,
      clipEnd: 11,
    });
  });

  it('returns null after the last clip or for an empty timeline', () => {
    expect(getNextTimelinePlaybackPosition(clips, 1)).toBeNull();
    expect(getNextTimelinePlaybackPosition([], 0)).toBeNull();
  });
});

describe('getTimelineTimeFromPlaybackSource', () => {
  it('maps active player source time back to global timeline time', () => {
    expect(getTimelineTimeFromPlaybackSource(clips, 1, 12.5)).toBe(7.5);
  });

  it('clamps the final clip to the exact timeline end', () => {
    expect(getTimelineTimeFromPlaybackSource(clips, 1, 99)).toBe(11);
    expect(hasReachedTimelineClipEnd(clips[1]!, 16)).toBe(true);
  });
});
