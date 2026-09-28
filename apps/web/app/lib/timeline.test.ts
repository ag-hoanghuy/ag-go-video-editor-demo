import { describe, expect, it } from 'vitest';
import {
  getTimelineContentXFromTime,
  getTimelinePositionAtTime,
  getTimelineTimeFromContentX,
  type TimelineClip,
} from './timeline';

const clips: TimelineClip[] = [
  { id: 'clip-a', mediaId: 'media-a', trimStart: 0, trimEnd: 5 },
  { id: 'clip-b', mediaId: 'media-b', trimStart: 2, trimEnd: 9 },
];

const mediaDurations = new Map<string, number | null>([
  ['media-a', 5],
  ['media-b', 12],
]);

describe('getTimelinePositionAtTime', () => {
  it('returns null for an empty timeline', () => {
    expect(getTimelinePositionAtTime([], 0)).toBeNull();
  });

  it('selects the following clip at an exact boundary', () => {
    const position = getTimelinePositionAtTime(clips, 5, mediaDurations);

    expect(position?.clip.id).toBe('clip-b');
    expect(position?.clipIndex).toBe(1);
    expect(position?.clipStart).toBe(5);
    expect(position?.localOffset).toBe(0);
    expect(position?.sourceTime).toBe(2);
  });

  it('maps global time through trimStart', () => {
    const position = getTimelinePositionAtTime(clips, 8, mediaDurations);

    expect(position?.clip.id).toBe('clip-b');
    expect(position?.localOffset).toBe(3);
    expect(position?.sourceTime).toBe(5);
  });

  it('maps total duration to a safe frame inside the last clip', () => {
    const position = getTimelinePositionAtTime(clips, 12, mediaDurations);

    expect(position?.clip.id).toBe('clip-b');
    expect(position?.sourceTime).toBeLessThan(9);
    expect(position?.sourceTime).toBeCloseTo(8.999, 3);
  });

  it('maps adjacent clips of the same media with different trims', () => {
    const sameMediaClips: TimelineClip[] = [
      { id: 'clip-a1', mediaId: 'media-a', trimStart: 0, trimEnd: 5 },
      { id: 'clip-a2', mediaId: 'media-a', trimStart: 10, trimEnd: 20 },
    ];
    const durations = new Map([['media-a', 30]]);

    expect(getTimelinePositionAtTime(sameMediaClips, 4.9, durations)?.sourceTime).toBeCloseTo(4.9);
    expect(getTimelinePositionAtTime(sameMediaClips, 5, durations)?.sourceTime).toBe(10);
  });
});

describe('timeline pixel mapping', () => {
  it('maps content pixels to timeline time and clamps to duration', () => {
    expect(getTimelineTimeFromContentX(160, 12)).toBe(8);
    expect(getTimelineTimeFromContentX(-20, 12)).toBe(0);
    expect(getTimelineTimeFromContentX(400, 12)).toBe(12);
  });

  it('maps timeline time to content pixels and clamps to duration', () => {
    expect(getTimelineContentXFromTime(8, 12)).toBe(160);
    expect(getTimelineContentXFromTime(-1, 12)).toBe(0);
    expect(getTimelineContentXFromTime(15, 12)).toBe(240);
  });
});
