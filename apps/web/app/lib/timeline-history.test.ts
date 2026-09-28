import { describe, expect, it } from 'vitest';
import {
  beginTimelineTrimTransaction,
  cancelTimelineTrimTransaction,
  clearTimelineHistory,
  commitTimelineEdit,
  commitTimelineTrimTransaction,
  createTimelineHistoryState,
  redoTimelineEdit,
  setTimelineHistorySelection,
  timelineHistoryLimit,
  undoTimelineEdit,
  updateTimelineTrimTransaction,
  type TimelineHistorySnapshot,
} from './timeline-history';
import { deleteTimelineClip, splitTimelineClip, type TimelineClip } from './timeline';

const clipA: TimelineClip = {
  id: 'clip-a',
  mediaId: 'media-a',
  trimStart: 0,
  trimEnd: 10,
};
const clipB: TimelineClip = {
  id: 'clip-b',
  mediaId: 'media-b',
  trimStart: 2,
  trimEnd: 8,
};

function snapshot(
  clips: TimelineClip[],
  selectedClipId: string | null = null,
): TimelineHistorySnapshot {
  return { clips, selectedClipId };
}

describe('timeline history navigation', () => {
  it('undoes an edit', () => {
    const initial = createTimelineHistoryState();
    const edited = commitTimelineEdit(initial, snapshot([clipA], clipA.id));

    expect(undoTimelineEdit(edited).present.clips).toEqual([]);
  });

  it('redoes an undone edit', () => {
    const edited = commitTimelineEdit(createTimelineHistoryState(), snapshot([clipA], clipA.id));
    const restored = redoTimelineEdit(undoTimelineEdit(edited));

    expect(restored.present).toEqual(snapshot([clipA], clipA.id));
  });

  it('supports multiple consecutive undo operations', () => {
    const first = commitTimelineEdit(createTimelineHistoryState(), snapshot([clipA], clipA.id));
    const second = commitTimelineEdit(first, snapshot([clipA, clipB], clipB.id));
    const twiceUndone = undoTimelineEdit(undoTimelineEdit(second));

    expect(twiceUndone.present.clips).toEqual([]);
    expect(twiceUndone.future).toHaveLength(2);
  });

  it('clears the old future after an undo followed by a new edit', () => {
    const first = commitTimelineEdit(createTimelineHistoryState(), snapshot([clipA], clipA.id));
    const second = commitTimelineEdit(first, snapshot([clipA, clipB], clipB.id));
    const undone = undoTimelineEdit(second);
    const branched = commitTimelineEdit(undone, snapshot([clipB], clipB.id));

    expect(branched.future).toEqual([]);
    expect(redoTimelineEdit(branched)).toBe(branched);
  });

  it('does not record a no-op edit', () => {
    const state = createTimelineHistoryState(snapshot([clipA], null));
    const selectedOnly = commitTimelineEdit(state, snapshot([{ ...clipA }], clipA.id));

    expect(selectedOnly.past).toEqual([]);
    expect(selectedOnly.present.selectedClipId).toBe(clipA.id);
  });

  it('limits retained past snapshots', () => {
    let state = createTimelineHistoryState();

    for (let index = 0; index < timelineHistoryLimit + 5; index += 1) {
      state = commitTimelineEdit(
        state,
        snapshot([{ ...clipA, id: `clip-${index}` }], `clip-${index}`),
      );
    }

    expect(state.past).toHaveLength(timelineHistoryLimit);
    expect(state.past[0]?.clips[0]?.id).toBe('clip-4');
  });

  it('restores the exact order after a reorder', () => {
    const initial = createTimelineHistoryState(snapshot([clipA, clipB], clipA.id));
    const reordered = commitTimelineEdit(initial, snapshot([clipB, clipA], clipA.id));

    expect(undoTimelineEdit(reordered).present.clips.map((clip) => clip.id)).toEqual([
      clipA.id,
      clipB.id,
    ]);
  });

  it('restores the selected clip stored in each snapshot', () => {
    const initial = createTimelineHistoryState(snapshot([clipA], clipA.id));
    const edited = commitTimelineEdit(initial, snapshot([clipA, clipB], clipB.id));

    expect(undoTimelineEdit(edited).present.selectedClipId).toBe(clipA.id);
    expect(redoTimelineEdit(undoTimelineEdit(edited)).present.selectedClipId).toBe(clipB.id);
  });
});

describe('timeline history edit identity', () => {
  it('undoes a split back to the original clip', () => {
    const splitClips = splitTimelineClip([clipA], clipA.id, 4, 'clip-left', 'clip-right');
    expect(splitClips).not.toBeNull();

    const initial = createTimelineHistoryState(snapshot([clipA], clipA.id));
    const edited = commitTimelineEdit(initial, snapshot(splitClips!, 'clip-right'));

    expect(undoTimelineEdit(edited).present.clips).toEqual([clipA]);
  });

  it('redoes a split with the original generated IDs', () => {
    const splitClips = splitTimelineClip([clipA], clipA.id, 4, 'clip-left', 'clip-right');
    expect(splitClips).not.toBeNull();

    const initial = createTimelineHistoryState(snapshot([clipA], clipA.id));
    const edited = commitTimelineEdit(initial, snapshot(splitClips!, 'clip-right'));
    const redone = redoTimelineEdit(undoTimelineEdit(edited));

    expect(redone.present.clips.map((clip) => clip.id)).toEqual(['clip-left', 'clip-right']);
  });

  it('restores a deleted clip at its original position', () => {
    const original = [clipA, clipB, { ...clipA, id: 'clip-c' }];
    const afterDelete = deleteTimelineClip(original, clipB.id);
    const initial = createTimelineHistoryState(snapshot(original, clipB.id));
    const edited = commitTimelineEdit(initial, snapshot(afterDelete, 'clip-c'));

    expect(undoTimelineEdit(edited).present.clips.map((clip) => clip.id)).toEqual([
      'clip-a',
      'clip-b',
      'clip-c',
    ]);
  });
});

describe('trim history transaction', () => {
  it('records many live trim updates as one undo step', () => {
    const initial = createTimelineHistoryState(snapshot([clipA], clipA.id));
    const started = beginTimelineTrimTransaction(initial, clipA.id);
    const firstUpdate = updateTimelineTrimTransaction(
      started,
      snapshot([{ ...clipA, trimStart: 1 }], clipA.id),
    );
    const secondUpdate = updateTimelineTrimTransaction(
      firstUpdate,
      snapshot([{ ...clipA, trimStart: 3 }], clipA.id),
    );
    const committed = commitTimelineTrimTransaction(secondUpdate);

    expect(committed.past).toHaveLength(1);
    expect(undoTimelineEdit(committed).present.clips).toEqual([clipA]);
  });

  it('rolls back a cancelled trim without recording history', () => {
    const initial = createTimelineHistoryState(snapshot([clipA], clipA.id));
    const started = beginTimelineTrimTransaction(initial, clipA.id);
    const updated = updateTimelineTrimTransaction(
      started,
      snapshot([{ ...clipA, trimEnd: 6 }], clipA.id),
    );
    const cancelled = cancelTimelineTrimTransaction(updated);

    expect(cancelled.present.clips).toEqual([clipA]);
    expect(cancelled.past).toEqual([]);
    expect(cancelled.future).toEqual([]);
  });
});

describe('timeline history cleanup', () => {
  it('clears past and future when media is removed', () => {
    const first = commitTimelineEdit(createTimelineHistoryState(), snapshot([clipA], clipA.id));
    const withFuture = undoTimelineEdit(first);
    const cleared = clearTimelineHistory(withFuture);

    expect(cleared.past).toEqual([]);
    expect(cleared.future).toEqual([]);
    expect(cleared.present).toEqual(withFuture.present);
  });

  it('updates selection without creating an undo entry', () => {
    const initial = createTimelineHistoryState(snapshot([clipA, clipB], clipA.id));
    const selected = setTimelineHistorySelection(initial, clipB.id);

    expect(selected.present.selectedClipId).toBe(clipB.id);
    expect(selected.past).toEqual([]);
  });
});
