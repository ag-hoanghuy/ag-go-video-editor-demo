import type { TimelineClip } from './timeline';

export interface TimelineHistorySnapshot {
  clips: TimelineClip[];
  selectedClipId: string | null;
}

export interface TimelineHistoryState {
  past: TimelineHistorySnapshot[];
  present: TimelineHistorySnapshot;
  future: TimelineHistorySnapshot[];
  trimTransactionStart: TimelineHistorySnapshot | null;
}

export const timelineHistoryLimit = 50;

function cloneTimelineSnapshot(snapshot: TimelineHistorySnapshot): TimelineHistorySnapshot {
  return {
    clips: snapshot.clips.map((clip) => ({ ...clip })),
    selectedClipId: snapshot.selectedClipId,
  };
}

function timelineClipsEqual(left: TimelineClip[], right: TimelineClip[]): boolean {
  return (
    left.length === right.length &&
    left.every((clip, index) => {
      const otherClip = right[index];

      return (
        otherClip !== undefined &&
        clip.id === otherClip.id &&
        clip.mediaId === otherClip.mediaId &&
        clip.trimStart === otherClip.trimStart &&
        clip.trimEnd === otherClip.trimEnd
      );
    })
  );
}

function appendPastSnapshot(
  past: TimelineHistorySnapshot[],
  snapshot: TimelineHistorySnapshot,
): TimelineHistorySnapshot[] {
  return [...past, cloneTimelineSnapshot(snapshot)].slice(-timelineHistoryLimit);
}

export function createTimelineHistoryState(
  snapshot: TimelineHistorySnapshot = { clips: [], selectedClipId: null },
): TimelineHistoryState {
  return {
    past: [],
    present: cloneTimelineSnapshot(snapshot),
    future: [],
    trimTransactionStart: null,
  };
}

export function commitTimelineEdit(
  state: TimelineHistoryState,
  snapshot: TimelineHistorySnapshot,
): TimelineHistoryState {
  if (state.trimTransactionStart) {
    return state;
  }

  if (timelineClipsEqual(state.present.clips, snapshot.clips)) {
    return state.present.selectedClipId === snapshot.selectedClipId
      ? state
      : { ...state, present: cloneTimelineSnapshot(snapshot) };
  }

  return {
    past: appendPastSnapshot(state.past, state.present),
    present: cloneTimelineSnapshot(snapshot),
    future: [],
    trimTransactionStart: null,
  };
}

export function undoTimelineEdit(state: TimelineHistoryState): TimelineHistoryState {
  const previous = state.past.at(-1);

  if (!previous || state.trimTransactionStart) {
    return state;
  }

  return {
    past: state.past.slice(0, -1),
    present: cloneTimelineSnapshot(previous),
    future: [cloneTimelineSnapshot(state.present), ...state.future],
    trimTransactionStart: null,
  };
}

export function redoTimelineEdit(state: TimelineHistoryState): TimelineHistoryState {
  const next = state.future[0];

  if (!next || state.trimTransactionStart) {
    return state;
  }

  return {
    past: appendPastSnapshot(state.past, state.present),
    present: cloneTimelineSnapshot(next),
    future: state.future.slice(1),
    trimTransactionStart: null,
  };
}

export function setTimelineHistorySelection(
  state: TimelineHistoryState,
  selectedClipId: string | null,
): TimelineHistoryState {
  if (state.present.selectedClipId === selectedClipId) {
    return state;
  }

  return {
    ...state,
    present: {
      ...state.present,
      selectedClipId,
    },
  };
}

export function beginTimelineTrimTransaction(
  state: TimelineHistoryState,
  selectedClipId: string,
): TimelineHistoryState {
  if (state.trimTransactionStart) {
    return state;
  }

  const present = {
    ...state.present,
    selectedClipId,
  };

  return {
    ...state,
    present,
    trimTransactionStart: cloneTimelineSnapshot(present),
  };
}

export function updateTimelineTrimTransaction(
  state: TimelineHistoryState,
  snapshot: TimelineHistorySnapshot,
): TimelineHistoryState {
  if (!state.trimTransactionStart) {
    return state;
  }

  if (
    timelineClipsEqual(state.present.clips, snapshot.clips) &&
    state.present.selectedClipId === snapshot.selectedClipId
  ) {
    return state;
  }

  return {
    ...state,
    present: cloneTimelineSnapshot(snapshot),
  };
}

export function commitTimelineTrimTransaction(state: TimelineHistoryState): TimelineHistoryState {
  const transactionStart = state.trimTransactionStart;

  if (!transactionStart) {
    return state;
  }

  if (timelineClipsEqual(transactionStart.clips, state.present.clips)) {
    return {
      ...state,
      trimTransactionStart: null,
    };
  }

  return {
    past: appendPastSnapshot(state.past, transactionStart),
    present: state.present,
    future: [],
    trimTransactionStart: null,
  };
}

export function cancelTimelineTrimTransaction(state: TimelineHistoryState): TimelineHistoryState {
  if (!state.trimTransactionStart) {
    return state;
  }

  return {
    ...state,
    present: cloneTimelineSnapshot(state.trimTransactionStart),
    trimTransactionStart: null,
  };
}

export function clearTimelineHistory(state: TimelineHistoryState): TimelineHistoryState {
  if (state.past.length === 0 && state.future.length === 0 && !state.trimTransactionStart) {
    return state;
  }

  return {
    past: [],
    present: state.present,
    future: [],
    trimTransactionStart: null,
  };
}
