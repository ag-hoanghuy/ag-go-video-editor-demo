import { describe, expect, it } from 'vitest';
import {
  deleteTimelineClip,
  getTimelineContentXFromTime,
  getTimelineDuration,
  getTimelinePositionAtTime,
  getTimelineSecondsFromPixelDelta,
  getTimelineSplitSourceTime,
  getTimelineTimeFromContentX,
  minimumTimelineClipDuration,
  splitTimelineClip,
  trimTimelineClip,
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
  it('converts trim drag pixels to seconds with the shared timeline scale', () => {
    expect(getTimelineSecondsFromPixelDelta(40)).toBe(2);
    expect(getTimelineSecondsFromPixelDelta(-20)).toBe(-1);
  });

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

describe('trimTimelineClip', () => {
  const clip: TimelineClip = {
    id: 'clip-trim',
    mediaId: 'media-a',
    trimStart: 2,
    trimEnd: 10,
  };

  it('trims the left edge without changing trimEnd', () => {
    expect(trimTimelineClip(clip, 'start', 4, 20)).toEqual({
      ...clip,
      trimStart: 4,
    });
  });

  it('trims the right edge without changing trimStart', () => {
    expect(trimTimelineClip(clip, 'end', 8, 20)).toEqual({
      ...clip,
      trimEnd: 8,
    });
  });

  it('clamps trim edges to source boundaries', () => {
    expect(trimTimelineClip(clip, 'start', -5, 12).trimStart).toBe(0);
    expect(trimTimelineClip(clip, 'end', 50, 12).trimEnd).toBe(12);
  });

  it('enforces the minimum clip duration', () => {
    const leftTrimmed = trimTimelineClip(clip, 'start', clip.trimEnd, 20);
    const rightTrimmed = trimTimelineClip(clip, 'end', clip.trimStart, 20);

    expect(leftTrimmed.trimEnd - leftTrimmed.trimStart).toBeCloseTo(minimumTimelineClipDuration);
    expect(rightTrimmed.trimEnd - rightTrimmed.trimStart).toBeCloseTo(minimumTimelineClipDuration);
  });
});

describe('timeline split', () => {
  it('splits a clip in the middle with two new IDs', () => {
    const result = splitTimelineClip([clips[1]!], 'clip-b', 5, 'clip-b-left', 'clip-b-right');

    expect(result).toEqual([
      { id: 'clip-b-left', mediaId: 'media-b', trimStart: 2, trimEnd: 5 },
      { id: 'clip-b-right', mediaId: 'media-b', trimStart: 5, trimEnd: 9 },
    ]);
  });

  it('rejects a split at either clip boundary', () => {
    expect(splitTimelineClip([clips[0]!], 'clip-a', 0, 'left', 'right')).toBeNull();
    expect(splitTimelineClip([clips[0]!], 'clip-a', 5, 'left', 'right')).toBeNull();
  });

  it('maps a global playhead through a non-zero trimStart', () => {
    expect(getTimelineSplitSourceTime(clips, 'clip-b', 8)).toBe(5);
  });

  it('rejects a split when the playhead is on another clip or too close to an edge', () => {
    expect(getTimelineSplitSourceTime(clips, 'clip-a', 5)).toBeNull();
    expect(getTimelineSplitSourceTime(clips, 'clip-b', 5.05)).toBeNull();
  });
});

describe('deleteTimelineClip', () => {
  it('deletes a middle clip and keeps no-gap duration derived from the remaining clips', () => {
    const threeClips: TimelineClip[] = [
      clips[0]!,
      clips[1]!,
      { id: 'clip-c', mediaId: 'media-c', trimStart: 3, trimEnd: 7 },
    ];
    const result = deleteTimelineClip(threeClips, 'clip-b');

    expect(result.map((clip) => clip.id)).toEqual(['clip-a', 'clip-c']);
    expect(getTimelineDuration(result)).toBe(9);
  });

  it('deletes the final clip', () => {
    expect(deleteTimelineClip(clips, 'clip-b')).toEqual([clips[0]]);
  });

  it('returns an empty timeline after deleting the only clip', () => {
    expect(deleteTimelineClip([clips[0]!], 'clip-a')).toEqual([]);
  });
});
