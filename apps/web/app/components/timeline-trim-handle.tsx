import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  getTimelineSecondsFromPixelDelta,
  type TimelineClip,
  type TimelineTrimEdge,
} from '../lib/timeline';

interface TimelineTrimHandleProps {
  clip: TimelineClip;
  edge: TimelineTrimEdge;
  mediaDuration: number;
  onSelect: (clip: TimelineClip) => void;
  onTrim: (
    clipId: string,
    edge: TimelineTrimEdge,
    requestedSourceTime: number,
    mediaDuration: number,
  ) => void;
}

interface TrimSession {
  pointerId: number;
  initialClientX: number;
  initialSourceTime: number;
}

export function TimelineTrimHandle({
  clip,
  edge,
  mediaDuration,
  onSelect,
  onTrim,
}: TimelineTrimHandleProps) {
  const sessionRef = useRef<TrimSession | null>(null);
  const [isTrimming, setIsTrimming] = useState(false);

  const updateTrim = (clientX: number) => {
    const session = sessionRef.current;

    if (!session) {
      return;
    }

    const deltaSeconds = getTimelineSecondsFromPixelDelta(clientX - session.initialClientX);
    onTrim(clip.id, edge, session.initialSourceTime + deltaSeconds, mediaDuration);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    sessionRef.current = {
      pointerId: event.pointerId,
      initialClientX: event.clientX,
      initialSourceTime: edge === 'start' ? clip.trimStart : clip.trimEnd,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsTrimming(true);
    onSelect(clip);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (sessionRef.current?.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    updateTrim(event.clientX);
  };

  const finishTrimming = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (sessionRef.current?.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    updateTrim(event.clientX);
    sessionRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setIsTrimming(false);
  };

  const cancelTrimming = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (sessionRef.current?.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    sessionRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setIsTrimming(false);
  };

  const handleLostPointerCapture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (sessionRef.current?.pointerId === event.pointerId) {
      sessionRef.current = null;
      setIsTrimming(false);
    }
  };

  return (
    <button
      className={`timeline-trim-handle timeline-trim-handle-${edge}${isTrimming ? ' timeline-trim-handle-active' : ''}`}
      type="button"
      tabIndex={-1}
      aria-label={edge === 'start' ? 'Cắt mép trái video' : 'Cắt mép phải video'}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishTrimming}
      onPointerCancel={cancelTrimming}
      onLostPointerCapture={handleLostPointerCapture}
    />
  );
}
