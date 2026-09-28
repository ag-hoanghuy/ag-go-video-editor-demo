'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import type { LocalMediaItem } from '../lib/local-media';
import {
  getNextTimelinePlaybackPosition,
  getTimelinePlaybackPosition,
  getTimelineTimeFromPlaybackSource,
  hasReachedTimelineClipEnd,
} from '../lib/timeline-playback';
import { getTimelineDuration, type TimelineClip } from '../lib/timeline';

export type PreviewControlMode = 'library' | 'timeline';
export type PreviewPlayerIndex = 0 | 1;

export interface LocalVideoPreviewTarget {
  mediaId: string;
  objectUrl: string;
  mode: PreviewControlMode;
  requestVersion: number;
  sourceTime: number | null;
}

export interface UseLocalVideoPreviewOptions {
  clips: TimelineClip[];
  currentTimelineTime: number;
  isPlaying: boolean;
  mediaItems: LocalMediaItem[];
  target: LocalVideoPreviewTarget | null;
  onIsPlayingChange: (isPlaying: boolean) => void;
  onPlaybackError: (message: string | null) => void;
  onTimelineTimeChange: (time: number) => void;
}

interface PreviewPlayerSlot {
  mediaId: string | null;
  objectUrl: string | null;
}

interface PlaybackContext {
  clipId: string;
  clipIndex: number;
  generation: number;
  playerIndex: PreviewPlayerIndex;
}

interface PreparedPlayer {
  playerIndex: PreviewPlayerIndex;
  video: HTMLVideoElement;
}

interface PreloadedClip {
  clipId: string;
  clipIndex: number;
  generation: number;
  preparation: Promise<PreparedPlayer>;
}

const sourceTimeTolerance = 0.0005;

function createAbortError(): DOMException {
  return new DOMException('Đã hủy cập nhật xem trước.', 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createAbortError();
  }
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: 'canplay' | 'loadedmetadata' | 'seeked',
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, handleSuccess);
      video.removeEventListener('error', handleError);
      signal.removeEventListener('abort', handleAbort);
    };

    const handleSuccess = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Không thể tải video xem trước.'));
    };

    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    if (signal.aborted) {
      handleAbort();
      return;
    }

    video.addEventListener(eventName, handleSuccess, { once: true });
    video.addEventListener('error', handleError, { once: true });
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

async function waitForLoadedMetadata(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return;
  }

  await waitForVideoEvent(video, 'loadedmetadata', signal);
}

async function seekVideo(
  video: HTMLVideoElement,
  sourceTime: number,
  signal: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);

  if (Math.abs(video.currentTime - sourceTime) < sourceTimeTolerance) {
    return;
  }

  const seekCompleted = waitForVideoEvent(video, 'seeked', signal);
  video.currentTime = sourceTime;
  await seekCompleted;
}

async function waitForPlayableData(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    return;
  }

  await waitForVideoEvent(video, 'canplay', signal);
}

function getOtherPlayerIndex(playerIndex: PreviewPlayerIndex): PreviewPlayerIndex {
  return playerIndex === 0 ? 1 : 0;
}

function releaseVideo(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute('src');
  video.load();
}

function getPlaybackErrorMessage(error: unknown): string {
  return error instanceof DOMException && error.name === 'NotAllowedError'
    ? 'Trình duyệt đã chặn phát video. Hãy bấm Phát lại.'
    : 'Không thể phát video trên dòng thời gian.';
}

export function useLocalVideoPreview(
  playerRefs: readonly [RefObject<HTMLVideoElement | null>, RefObject<HTMLVideoElement | null>],
  options: UseLocalVideoPreviewOptions,
): {
  activePlayerIndex: PreviewPlayerIndex;
  playTimeline: () => Promise<void>;
  pauseTimelinePlayback: () => void;
} {
  const [activePlayerIndex, setActivePlayerIndex] = useState<PreviewPlayerIndex>(0);
  const activePlayerIndexRef = useRef<PreviewPlayerIndex>(0);
  const animationFrameRef = useRef<number | null>(null);
  const asyncControllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const isMountedRef = useRef(true);
  const optionsRef = useRef(options);
  const playbackContextRef = useRef<PlaybackContext | null>(null);
  const playbackRequestedRef = useRef(false);
  const playerRefsRef = useRef(playerRefs);
  const playerSlotsRef = useRef<[PreviewPlayerSlot, PreviewPlayerSlot]>([
    { mediaId: null, objectUrl: null },
    { mediaId: null, objectUrl: null },
  ]);
  const preloadedClipRef = useRef<PreloadedClip | null>(null);

  useEffect(() => {
    optionsRef.current = options;
    playerRefsRef.current = playerRefs;
  });

  const getPlayer = useCallback((playerIndex: PreviewPlayerIndex) => {
    return playerRefsRef.current[playerIndex].current;
  }, []);

  const cancelAnimationFrameLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const invalidateAsyncOperations = useCallback(() => {
    asyncControllerRef.current?.abort();
    asyncControllerRef.current = null;
    generationRef.current += 1;
    preloadedClipRef.current = null;
    return generationRef.current;
  }, []);

  const pausePlayers = useCallback(() => {
    getPlayer(0)?.pause();
    getPlayer(1)?.pause();
  }, [getPlayer]);

  const showPlayer = useCallback((playerIndex: PreviewPlayerIndex) => {
    activePlayerIndexRef.current = playerIndex;

    if (isMountedRef.current) {
      setActivePlayerIndex(playerIndex);
    }
  }, []);

  const choosePlayerForMedia = useCallback(
    (mediaId: string, objectUrl: string): PreviewPlayerIndex => {
      const activeIndex = activePlayerIndexRef.current;
      const standbyIndex = getOtherPlayerIndex(activeIndex);
      const activeSlot = playerSlotsRef.current[activeIndex];
      const standbySlot = playerSlotsRef.current[standbyIndex];

      if (activeSlot.mediaId === mediaId && activeSlot.objectUrl === objectUrl) {
        return activeIndex;
      }

      if (standbySlot.mediaId === mediaId && standbySlot.objectUrl === objectUrl) {
        return standbyIndex;
      }

      return standbyIndex;
    },
    [],
  );

  const preparePlayer = useCallback(
    async (
      playerIndex: PreviewPlayerIndex,
      mediaId: string,
      objectUrl: string,
      sourceTime: number | null,
      signal: AbortSignal,
    ): Promise<PreparedPlayer> => {
      const video = getPlayer(playerIndex);

      if (!video) {
        throw new Error('Không tìm thấy trình phát video.');
      }

      const slot = playerSlotsRef.current[playerIndex];
      const sourceChanged =
        slot.mediaId !== mediaId || slot.objectUrl !== objectUrl || video.error !== null;

      video.pause();
      video.preload = 'auto';

      if (sourceChanged) {
        slot.mediaId = mediaId;
        slot.objectUrl = objectUrl;
        video.src = objectUrl;
        video.load();
      }

      try {
        await waitForLoadedMetadata(video, signal);
        throwIfAborted(signal);

        if (sourceTime !== null) {
          await seekVideo(video, sourceTime, signal);
        }

        await waitForPlayableData(video, signal);
        throwIfAborted(signal);
        return { playerIndex, video };
      } catch (error) {
        if (!isAbortError(error) && slot.mediaId === mediaId && slot.objectUrl === objectUrl) {
          releaseVideo(video);
          slot.mediaId = null;
          slot.objectUrl = null;
        }

        throw error;
      }
    },
    [getPlayer],
  );

  const findMedia = useCallback((mediaId: string) => {
    return optionsRef.current.mediaItems.find((media) => media.id === mediaId) ?? null;
  }, []);

  const stopPlaybackWithError = useCallback(
    (error: unknown, generation: number) => {
      if (generationRef.current !== generation || !isMountedRef.current) {
        return;
      }

      cancelAnimationFrameLoop();
      pausePlayers();
      playbackContextRef.current = null;
      playbackRequestedRef.current = false;
      invalidateAsyncOperations();
      optionsRef.current.onIsPlayingChange(false);
      optionsRef.current.onPlaybackError(getPlaybackErrorMessage(error));
    },
    [cancelAnimationFrameLoop, invalidateAsyncOperations, pausePlayers],
  );

  const preloadNextClip = useCallback(
    (context: PlaybackContext, signal: AbortSignal) => {
      const nextPosition = getNextTimelinePlaybackPosition(
        optionsRef.current.clips,
        context.clipIndex,
      );

      if (!nextPosition) {
        preloadedClipRef.current = null;
        return;
      }

      const media = findMedia(nextPosition.clip.mediaId);

      if (!media) {
        preloadedClipRef.current = null;
        return;
      }

      const preparation = preparePlayer(
        getOtherPlayerIndex(context.playerIndex),
        media.id,
        media.objectUrl,
        nextPosition.clip.trimStart,
        signal,
      );

      preloadedClipRef.current = {
        clipId: nextPosition.clip.id,
        clipIndex: nextPosition.clipIndex,
        generation: context.generation,
        preparation,
      };

      void preparation.catch(() => undefined);
    },
    [findMedia, preparePlayer],
  );

  const finishTimelinePlayback = useCallback(
    (context: PlaybackContext) => {
      if (generationRef.current !== context.generation) {
        return;
      }

      cancelAnimationFrameLoop();
      const { clips, mediaItems, onIsPlayingChange, onTimelineTimeChange } = optionsRef.current;
      const timelineDuration = getTimelineDuration(clips);
      const mediaDurations = new Map(mediaItems.map((media) => [media.id, media.duration]));
      const finalPosition = getTimelinePlaybackPosition(clips, timelineDuration, mediaDurations);
      const video = getPlayer(context.playerIndex);

      video?.pause();

      if (video && finalPosition?.clip.id === context.clipId) {
        video.currentTime = finalPosition.sourceTime;
      }

      playbackContextRef.current = null;
      playbackRequestedRef.current = false;
      invalidateAsyncOperations();
      onTimelineTimeChange(timelineDuration);
      onIsPlayingChange(false);
    },
    [cancelAnimationFrameLoop, getPlayer, invalidateAsyncOperations],
  );

  const schedulePlaybackFrameRef = useRef<() => void>(() => undefined);
  const transitionToNextClipRef = useRef<(context: PlaybackContext) => void>(() => undefined);

  const transitionToNextClip = useCallback(
    (context: PlaybackContext) => {
      const controller = asyncControllerRef.current;

      if (
        !controller ||
        controller.signal.aborted ||
        generationRef.current !== context.generation ||
        playbackContextRef.current !== context
      ) {
        return;
      }

      getPlayer(context.playerIndex)?.pause();
      const nextPosition = getNextTimelinePlaybackPosition(
        optionsRef.current.clips,
        context.clipIndex,
      );

      if (!nextPosition) {
        finishTimelinePlayback(context);
        return;
      }

      optionsRef.current.onTimelineTimeChange(nextPosition.clipStart);

      const preloadedClip = preloadedClipRef.current;
      const preparation =
        preloadedClip?.generation === context.generation &&
        preloadedClip.clipId === nextPosition.clip.id &&
        preloadedClip.clipIndex === nextPosition.clipIndex
          ? preloadedClip.preparation
          : (() => {
              const media = findMedia(nextPosition.clip.mediaId);

              if (!media) {
                return Promise.reject(new Error('Không tìm thấy video của clip tiếp theo.'));
              }

              return preparePlayer(
                getOtherPlayerIndex(context.playerIndex),
                media.id,
                media.objectUrl,
                nextPosition.clip.trimStart,
                controller.signal,
              );
            })();

      void (async () => {
        try {
          const prepared = await preparation;

          if (
            controller.signal.aborted ||
            generationRef.current !== context.generation ||
            playbackContextRef.current !== context
          ) {
            return;
          }

          const nextContext: PlaybackContext = {
            clipId: nextPosition.clip.id,
            clipIndex: nextPosition.clipIndex,
            generation: context.generation,
            playerIndex: prepared.playerIndex,
          };

          preloadedClipRef.current = null;
          playbackContextRef.current = nextContext;
          showPlayer(prepared.playerIndex);
          await prepared.video.play();

          if (
            controller.signal.aborted ||
            generationRef.current !== context.generation ||
            playbackContextRef.current !== nextContext
          ) {
            prepared.video.pause();
            return;
          }

          preloadNextClip(nextContext, controller.signal);
          schedulePlaybackFrameRef.current();
        } catch (error) {
          if (!controller.signal.aborted && generationRef.current === context.generation) {
            stopPlaybackWithError(error, context.generation);
          }
        }
      })();
    },
    [
      findMedia,
      finishTimelinePlayback,
      getPlayer,
      preloadNextClip,
      preparePlayer,
      showPlayer,
      stopPlaybackWithError,
    ],
  );

  const schedulePlaybackFrame = useCallback(() => {
    cancelAnimationFrameLoop();

    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const context = playbackContextRef.current;

      if (!context || generationRef.current !== context.generation) {
        return;
      }

      const video = getPlayer(context.playerIndex);
      const clip = optionsRef.current.clips[context.clipIndex];

      if (!video || !clip || clip.id !== context.clipId) {
        stopPlaybackWithError(new Error('Dòng thời gian đã thay đổi.'), context.generation);
        return;
      }

      if (hasReachedTimelineClipEnd(clip, video.currentTime)) {
        transitionToNextClipRef.current(context);
        return;
      }

      if (video.error) {
        stopPlaybackWithError(video.error, context.generation);
        return;
      }

      if (video.paused) {
        optionsRef.current.onTimelineTimeChange(
          getTimelineTimeFromPlaybackSource(
            optionsRef.current.clips,
            context.clipIndex,
            video.currentTime,
          ),
        );
        playbackContextRef.current = null;
        playbackRequestedRef.current = false;
        invalidateAsyncOperations();
        optionsRef.current.onIsPlayingChange(false);
        return;
      }

      optionsRef.current.onTimelineTimeChange(
        getTimelineTimeFromPlaybackSource(
          optionsRef.current.clips,
          context.clipIndex,
          video.currentTime,
        ),
      );
      schedulePlaybackFrameRef.current();
    });
  }, [cancelAnimationFrameLoop, getPlayer, invalidateAsyncOperations, stopPlaybackWithError]);

  useEffect(() => {
    transitionToNextClipRef.current = transitionToNextClip;
    schedulePlaybackFrameRef.current = schedulePlaybackFrame;
  }, [schedulePlaybackFrame, transitionToNextClip]);

  const pauseTimelinePlayback = useCallback(() => {
    const context = playbackContextRef.current;

    if (context && generationRef.current === context.generation) {
      const video = getPlayer(context.playerIndex);

      if (video) {
        optionsRef.current.onTimelineTimeChange(
          getTimelineTimeFromPlaybackSource(
            optionsRef.current.clips,
            context.clipIndex,
            video.currentTime,
          ),
        );
      }
    }

    cancelAnimationFrameLoop();
    pausePlayers();
    playbackContextRef.current = null;
    playbackRequestedRef.current = false;
    invalidateAsyncOperations();
    optionsRef.current.onIsPlayingChange(false);
  }, [cancelAnimationFrameLoop, getPlayer, invalidateAsyncOperations, pausePlayers]);

  const playTimeline = useCallback(async () => {
    const { clips, currentTimelineTime, mediaItems } = optionsRef.current;
    const timelineDuration = getTimelineDuration(clips);

    playbackRequestedRef.current = true;

    if (timelineDuration <= 0) {
      playbackRequestedRef.current = false;
      optionsRef.current.onTimelineTimeChange(0);
      optionsRef.current.onIsPlayingChange(false);
      return;
    }

    const startTime = currentTimelineTime >= timelineDuration ? 0 : currentTimelineTime;
    const mediaDurations = new Map(mediaItems.map((media) => [media.id, media.duration]));
    const position = getTimelinePlaybackPosition(clips, startTime, mediaDurations);

    if (!position) {
      playbackRequestedRef.current = false;
      optionsRef.current.onTimelineTimeChange(0);
      optionsRef.current.onIsPlayingChange(false);
      return;
    }

    cancelAnimationFrameLoop();
    pausePlayers();
    playbackContextRef.current = null;
    const generation = invalidateAsyncOperations();
    const controller = new AbortController();
    asyncControllerRef.current = controller;
    const media = findMedia(position.clip.mediaId);

    if (!media) {
      stopPlaybackWithError(new Error('Không tìm thấy video của clip.'), generation);
      return;
    }

    optionsRef.current.onPlaybackError(null);
    optionsRef.current.onTimelineTimeChange(position.timelineTime);
    optionsRef.current.onIsPlayingChange(true);

    try {
      const prepared = await preparePlayer(
        choosePlayerForMedia(media.id, media.objectUrl),
        media.id,
        media.objectUrl,
        position.sourceTime,
        controller.signal,
      );

      if (controller.signal.aborted || generationRef.current !== generation) {
        return;
      }

      const context: PlaybackContext = {
        clipId: position.clip.id,
        clipIndex: position.clipIndex,
        generation,
        playerIndex: prepared.playerIndex,
      };

      playbackContextRef.current = context;
      showPlayer(prepared.playerIndex);
      await prepared.video.play();

      if (
        controller.signal.aborted ||
        generationRef.current !== generation ||
        playbackContextRef.current !== context
      ) {
        prepared.video.pause();
        return;
      }

      playbackRequestedRef.current = false;
      preloadNextClip(context, controller.signal);
      schedulePlaybackFrameRef.current();
    } catch (error) {
      if (!controller.signal.aborted && generationRef.current === generation) {
        stopPlaybackWithError(error, generation);
      }
    }
  }, [
    cancelAnimationFrameLoop,
    choosePlayerForMedia,
    findMedia,
    invalidateAsyncOperations,
    pausePlayers,
    preparePlayer,
    preloadNextClip,
    showPlayer,
    stopPlaybackWithError,
  ]);

  const isPlaying = options.isPlaying;
  const clips = options.clips;
  const mediaItems = options.mediaItems;
  const target = options.target;

  const previousClipsRef = useRef(clips);

  useEffect(() => {
    const availableMediaIds = new Set(mediaItems.map((media) => media.id));

    for (const playerIndex of [0, 1] as const) {
      const slot = playerSlotsRef.current[playerIndex];

      if (slot.mediaId === null || availableMediaIds.has(slot.mediaId)) {
        continue;
      }

      const video = getPlayer(playerIndex);

      if (video) {
        releaseVideo(video);
      }

      slot.mediaId = null;
      slot.objectUrl = null;
    }
  }, [getPlayer, mediaItems]);

  useEffect(() => {
    const timelineChanged = previousClipsRef.current !== clips;
    previousClipsRef.current = clips;

    if (timelineChanged && isPlaying) {
      pauseTimelinePlayback();
    }
  }, [clips, isPlaying, pauseTimelinePlayback]);

  useEffect(() => {
    if (isPlaying || playbackRequestedRef.current) {
      return;
    }

    const generation = invalidateAsyncOperations();
    const controller = new AbortController();
    asyncControllerRef.current = controller;
    cancelAnimationFrameLoop();
    pausePlayers();
    playbackContextRef.current = null;

    if (!target) {
      for (const playerIndex of [0, 1] as const) {
        const video = getPlayer(playerIndex);

        if (video) {
          releaseVideo(video);
        }

        playerSlotsRef.current[playerIndex] = { mediaId: null, objectUrl: null };
      }

      return () => controller.abort();
    }

    void (async () => {
      try {
        const prepared = await preparePlayer(
          choosePlayerForMedia(target.mediaId, target.objectUrl),
          target.mediaId,
          target.objectUrl,
          target.mode === 'timeline' ? target.sourceTime : null,
          controller.signal,
        );

        if (controller.signal.aborted || generationRef.current !== generation) {
          return;
        }

        showPlayer(prepared.playerIndex);
      } catch {
        if (!controller.signal.aborted && generationRef.current === generation) {
          optionsRef.current.onPlaybackError('Không thể tải video xem trước.');
        }
      }
    })();

    return () => controller.abort();
  }, [
    cancelAnimationFrameLoop,
    choosePlayerForMedia,
    getPlayer,
    invalidateAsyncOperations,
    isPlaying,
    pausePlayers,
    preparePlayer,
    showPlayer,
    target,
  ]);

  useEffect(() => {
    isMountedRef.current = true;
    const playerSlots = playerSlotsRef.current;

    return () => {
      isMountedRef.current = false;
      playbackRequestedRef.current = false;
      cancelAnimationFrameLoop();
      invalidateAsyncOperations();
      playbackContextRef.current = null;
      pausePlayers();

      for (const playerIndex of [0, 1] as const) {
        const video = getPlayer(playerIndex);

        if (video) {
          releaseVideo(video);
        }

        playerSlots[playerIndex] = { mediaId: null, objectUrl: null };
      }
    };
  }, [cancelAnimationFrameLoop, getPlayer, invalidateAsyncOperations, pausePlayers]);

  return { activePlayerIndex, playTimeline, pauseTimelinePlayback };
}
