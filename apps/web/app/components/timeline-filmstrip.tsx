import { useEffect, useMemo, useRef, useState } from 'react';
import { getFilmstripFrameCacheKey, getFilmstripTimestamps } from '../lib/filmstrip';
import type { FilmstripFrameManager } from '../lib/filmstrip-frame-manager';
import type { LocalMediaItem } from '../lib/local-media';
import type { TimelineClip } from '../lib/timeline';

interface TimelineFilmstripProps {
  clip: TimelineClip;
  clipWidth: number;
  media: LocalMediaItem;
  manager: FilmstripFrameManager;
  scrollRoot: HTMLDivElement | null;
}

const viewportRootMargin = '300px';

export function TimelineFilmstrip({
  clip,
  clipWidth,
  media,
  manager,
  scrollRoot,
}: TimelineFilmstripProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [frameUrls, setFrameUrls] = useState<Record<string, string>>({});
  const timestamps = useMemo(
    () => getFilmstripTimestamps(clip.trimStart, clip.trimEnd, media.duration, clipWidth),
    [clip.trimEnd, clip.trimStart, clipWidth, media.duration],
  );
  const frameKeys = useMemo(
    () => timestamps.map((timestamp) => getFilmstripFrameCacheKey(media.id, timestamp)),
    [media.id, timestamps],
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container || isNearViewport) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      const animationFrame = requestAnimationFrame(() => setIsNearViewport(true));
      return () => cancelAnimationFrame(animationFrame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { root: scrollRoot, rootMargin: viewportRootMargin },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [isNearViewport, scrollRoot]);

  useEffect(() => {
    if (!isNearViewport || timestamps.length === 0) {
      return;
    }

    let isActive = true;

    void (async () => {
      for (let index = 0; index < timestamps.length; index += 1) {
        const timestamp = timestamps[index];
        const frameKey = frameKeys[index];

        if (timestamp === undefined || frameKey === undefined) {
          continue;
        }

        const frameUrl = await manager.requestFrame(media.id, media.objectUrl, timestamp);

        if (!isActive) {
          return;
        }

        if (frameUrl) {
          setFrameUrls((currentUrls) =>
            currentUrls[frameKey] === frameUrl
              ? currentUrls
              : { ...currentUrls, [frameKey]: frameUrl },
          );
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [frameKeys, isNearViewport, manager, media.id, media.objectUrl, timestamps]);

  return (
    <div ref={containerRef} className="timeline-filmstrip" aria-hidden="true">
      {frameKeys.map((frameKey, index) => {
        const imageUrl = frameUrls[frameKey] ?? media.thumbnailUrl;

        return (
          <span
            key={`${frameKey}:${index}`}
            className="timeline-filmstrip-frame"
            style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
          />
        );
      })}
    </div>
  );
}
