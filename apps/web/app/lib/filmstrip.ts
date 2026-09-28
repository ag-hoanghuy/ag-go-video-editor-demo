export const filmstripFrameTileWidth = 84;
export const maxFilmstripFramesPerClip = 14;

const cacheTimestampPrecision = 1000;
const maximumTimestampEpsilon = 0.001;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function getFilmstripFrameCount(clipWidth: number): number {
  if (!Number.isFinite(clipWidth) || clipWidth <= 0) {
    return 1;
  }

  return clamp(Math.ceil(clipWidth / filmstripFrameTileWidth), 1, maxFilmstripFramesPerClip);
}

export function getFilmstripTimestamps(
  trimStart: number,
  trimEnd: number,
  mediaDuration: number | null,
  clipWidth: number,
): number[] {
  if (
    mediaDuration === null ||
    !Number.isFinite(mediaDuration) ||
    mediaDuration <= 0 ||
    !Number.isFinite(trimStart) ||
    !Number.isFinite(trimEnd)
  ) {
    return [];
  }

  const rangeStart = clamp(trimStart, 0, mediaDuration);
  const rangeEnd = clamp(trimEnd, rangeStart, mediaDuration);

  if (rangeEnd <= rangeStart) {
    return [];
  }

  const frameCount = getFilmstripFrameCount(clipWidth);
  const segmentDuration = (rangeEnd - rangeStart) / frameCount;
  const timestampEpsilon = Math.min(maximumTimestampEpsilon, segmentDuration / 2);
  const maximumTimestamp = Math.min(rangeEnd, mediaDuration) - timestampEpsilon;

  return Array.from({ length: frameCount }, (_, index) => {
    const timestamp = rangeStart + (index + 0.5) * segmentDuration;
    return clamp(timestamp, rangeStart, maximumTimestamp);
  });
}

export function normalizeFilmstripTimestamp(timestamp: number): number {
  return Math.round(timestamp * cacheTimestampPrecision) / cacheTimestampPrecision;
}

export function getFilmstripFrameCacheKey(mediaId: string, timestamp: number): string {
  return `${mediaId}:${normalizeFilmstripTimestamp(timestamp).toFixed(3)}`;
}
