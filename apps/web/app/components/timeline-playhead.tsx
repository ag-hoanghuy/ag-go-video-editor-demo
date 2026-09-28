import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { formatTimelineTime } from '../lib/timeline';

interface TimelinePlayheadProps {
  currentTime: number;
  positionX: number;
  onScrubClientX: (clientX: number) => void;
}

export function TimelinePlayhead({
  currentTime,
  positionX,
  onScrubClientX,
}: TimelinePlayheadProps) {
  const activePointerIdRef = useRef<number | null>(null);
  const pointerOffsetXRef = useRef(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const rectangle = event.currentTarget.getBoundingClientRect();
    pointerOffsetXRef.current = event.clientX - (rectangle.left + rectangle.width / 2);
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsScrubbing(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onScrubClientX(event.clientX - pointerOffsetXRef.current);
  };

  const finishScrubbing = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onScrubClientX(event.clientX - pointerOffsetXRef.current);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activePointerIdRef.current = null;
    pointerOffsetXRef.current = 0;
    setIsScrubbing(false);
  };

  const cancelScrubbing = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activePointerIdRef.current = null;
    pointerOffsetXRef.current = 0;
    setIsScrubbing(false);
  };

  const handleLostPointerCapture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current === event.pointerId) {
      activePointerIdRef.current = null;
      pointerOffsetXRef.current = 0;
      setIsScrubbing(false);
    }
  };

  return (
    <div
      className={`timeline-playhead${isScrubbing ? ' timeline-playhead-scrubbing' : ''}`}
      style={{ left: positionX }}
    >
      <button
        className="timeline-playhead-handle"
        type="button"
        aria-label={`Đầu phát tại ${formatTimelineTime(currentTime)}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishScrubbing}
        onPointerCancel={cancelScrubbing}
        onLostPointerCapture={handleLostPointerCapture}
      />
      <span className="timeline-playhead-line" aria-hidden="true" />
    </div>
  );
}
