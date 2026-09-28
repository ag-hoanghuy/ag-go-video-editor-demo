'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { EditorDragOverlay } from './editor-drag-overlay';
import { EditorTimeline } from './editor-timeline';
import { MediaLibrary } from './media-library';
import { useFilmstripFrameManager } from '../hooks/use-filmstrip-frame-manager';
import {
  useLocalVideoPreview,
  type LocalVideoPreviewTarget,
  type PreviewControlMode,
} from '../hooks/use-local-video-preview';
import { readEditorDragData, timelineTrackDndId, type EditorDragData } from '../lib/editor-dnd';
import {
  createLocalVideoThumbnail,
  formatMediaDuration,
  getLocalMediaErrorMessage,
  isAbortError,
  isMp4File,
  readLocalVideoDuration,
  type LocalMediaItem,
} from '../lib/local-media';
import {
  clampTimelineTime,
  createTimelineClip,
  deleteTimelineClip,
  getTimelineClipDuration,
  getTimelineDuration,
  getTimelinePositionAtTime,
  getTimelineSplitSourceTime,
  insertTimelineClip,
  splitTimelineClip,
  trimTimelineClip,
  type TimelineClip,
  type TimelineTrimEdge,
} from '../lib/timeline';
import {
  beginTimelineTrimTransaction,
  cancelTimelineTrimTransaction,
  clearTimelineHistory,
  commitTimelineEdit,
  commitTimelineTrimTransaction,
  createTimelineHistoryState,
  redoTimelineEdit,
  setTimelineHistorySelection,
  undoTimelineEdit,
  updateTimelineTrimTransaction,
  type TimelineHistoryState,
} from '../lib/timeline-history';

interface EditorState {
  mediaItems: LocalMediaItem[];
  activeMediaId: string | null;
  timelineHistory: TimelineHistoryState;
}

type MediaItemChanges = Partial<
  Pick<LocalMediaItem, 'duration' | 'thumbnailUrl' | 'status' | 'errorMessage'>
>;

type EditorAction =
  | { type: 'add-media'; items: LocalMediaItem[] }
  | { type: 'update-media'; id: string; changes: MediaItemChanges }
  | { type: 'select-media'; id: string }
  | { type: 'remove-media'; id: string }
  | { type: 'add-timeline-clip'; clip: TimelineClip; insertionIndex: number }
  | { type: 'reorder-timeline-clips'; clips: TimelineClip[] }
  | { type: 'select-timeline-clip'; clip: TimelineClip }
  | {
      type: 'trim-timeline-clip';
      clipId: string;
      edge: TimelineTrimEdge;
      requestedSourceTime: number;
      mediaDuration: number;
    }
  | {
      type: 'split-timeline-clip';
      clipId: string;
      sourceTime: number;
      leftClipId: string;
      rightClipId: string;
    }
  | { type: 'delete-timeline-clip'; clipId: string }
  | { type: 'begin-timeline-trim'; clipId: string }
  | { type: 'commit-timeline-trim' }
  | { type: 'cancel-timeline-trim' }
  | { type: 'undo-timeline-edit' }
  | { type: 'redo-timeline-edit' };

interface ManagedMediaResource {
  objectUrl: string;
  thumbnailUrl: string | null;
  abortController: AbortController;
}

interface PreviewWorkspaceProps {
  media: LocalMediaItem | null;
  target: LocalVideoPreviewTarget | null;
}

const initialEditorState: EditorState = {
  mediaItems: [],
  activeMediaId: null,
  timelineHistory: createTimelineHistoryState(),
};

const editorCollisionDetection: CollisionDetection = (arguments_) => {
  const pointerCollisions = pointerWithin(arguments_);

  const clipCollisions = pointerCollisions.filter(
    (collision) => collision.id !== timelineTrackDndId,
  );

  return clipCollisions.length > 0 ? clipCollisions : pointerCollisions;
};

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'add-media':
      return {
        ...state,
        mediaItems: [...state.mediaItems, ...action.items],
        activeMediaId: state.activeMediaId ?? action.items[0]?.id ?? null,
      };
    case 'update-media':
      return {
        ...state,
        mediaItems: state.mediaItems.map((item) =>
          item.id === action.id ? { ...item, ...action.changes } : item,
        ),
      };
    case 'select-media':
      return state.mediaItems.some((item) => item.id === action.id)
        ? { ...state, activeMediaId: action.id }
        : state;
    case 'remove-media': {
      const removedIndex = state.mediaItems.findIndex((item) => item.id === action.id);

      if (removedIndex === -1) {
        return state;
      }

      const mediaItems = state.mediaItems.filter((item) => item.id !== action.id);
      const activeMediaId =
        state.activeMediaId === action.id
          ? (mediaItems[Math.min(removedIndex, mediaItems.length - 1)]?.id ?? null)
          : state.activeMediaId;

      return {
        ...state,
        mediaItems,
        activeMediaId,
        timelineHistory: clearTimelineHistory(state.timelineHistory),
      };
    }
    case 'add-timeline-clip': {
      const timelineHistory = commitTimelineEdit(state.timelineHistory, {
        clips: insertTimelineClip(
          state.timelineHistory.present.clips,
          action.clip,
          action.insertionIndex,
        ),
        selectedClipId: action.clip.id,
      });

      return {
        ...state,
        timelineHistory,
        activeMediaId: action.clip.mediaId,
      };
    }
    case 'reorder-timeline-clips':
      return {
        ...state,
        timelineHistory: commitTimelineEdit(state.timelineHistory, {
          clips: action.clips,
          selectedClipId: state.timelineHistory.present.selectedClipId,
        }),
      };
    case 'select-timeline-clip':
      return state.timelineHistory.present.clips.some((clip) => clip.id === action.clip.id)
        ? {
            ...state,
            timelineHistory: setTimelineHistorySelection(state.timelineHistory, action.clip.id),
            activeMediaId: action.clip.mediaId,
          }
        : state;
    case 'trim-timeline-clip': {
      const present = state.timelineHistory.present;
      const clipIndex = present.clips.findIndex((clip) => clip.id === action.clipId);
      const clip = present.clips[clipIndex];

      if (!clip) {
        return state;
      }

      const trimmedClip = trimTimelineClip(
        clip,
        action.edge,
        action.requestedSourceTime,
        action.mediaDuration,
      );

      if (trimmedClip === clip) {
        return state;
      }

      const clips = [...present.clips];
      clips[clipIndex] = trimmedClip;

      return {
        ...state,
        timelineHistory: updateTimelineTrimTransaction(state.timelineHistory, {
          clips,
          selectedClipId: clip.id,
        }),
        activeMediaId: clip.mediaId,
      };
    }
    case 'split-timeline-clip': {
      const originalClip = state.timelineHistory.present.clips.find(
        (clip) => clip.id === action.clipId,
      );
      const clips = splitTimelineClip(
        state.timelineHistory.present.clips,
        action.clipId,
        action.sourceTime,
        action.leftClipId,
        action.rightClipId,
      );

      if (!originalClip || !clips) {
        return state;
      }

      return {
        ...state,
        timelineHistory: commitTimelineEdit(state.timelineHistory, {
          clips,
          selectedClipId: action.rightClipId,
        }),
        activeMediaId: originalClip.mediaId,
      };
    }
    case 'delete-timeline-clip': {
      const present = state.timelineHistory.present;
      const removedIndex = present.clips.findIndex((clip) => clip.id === action.clipId);

      if (removedIndex === -1) {
        return state;
      }

      const clips = deleteTimelineClip(present.clips, action.clipId);
      const selectedClip =
        present.selectedClipId === action.clipId
          ? (clips[Math.min(removedIndex, clips.length - 1)] ?? null)
          : (clips.find((clip) => clip.id === present.selectedClipId) ?? null);

      return {
        ...state,
        timelineHistory: commitTimelineEdit(state.timelineHistory, {
          clips,
          selectedClipId: selectedClip?.id ?? null,
        }),
        activeMediaId: selectedClip?.mediaId ?? state.activeMediaId,
      };
    }
    case 'begin-timeline-trim': {
      const clip = state.timelineHistory.present.clips.find((item) => item.id === action.clipId);

      return clip
        ? {
            ...state,
            timelineHistory: beginTimelineTrimTransaction(state.timelineHistory, clip.id),
            activeMediaId: clip.mediaId,
          }
        : state;
    }
    case 'commit-timeline-trim':
      return {
        ...state,
        timelineHistory: commitTimelineTrimTransaction(state.timelineHistory),
      };
    case 'cancel-timeline-trim':
      return {
        ...state,
        timelineHistory: cancelTimelineTrimTransaction(state.timelineHistory),
      };
    case 'undo-timeline-edit': {
      const timelineHistory = undoTimelineEdit(state.timelineHistory);
      const selectedClip = timelineHistory.present.clips.find(
        (clip) => clip.id === timelineHistory.present.selectedClipId,
      );

      return {
        ...state,
        timelineHistory,
        activeMediaId: selectedClip?.mediaId ?? state.activeMediaId,
      };
    }
    case 'redo-timeline-edit': {
      const timelineHistory = redoTimelineEdit(state.timelineHistory);
      const selectedClip = timelineHistory.present.clips.find(
        (clip) => clip.id === timelineHistory.present.selectedClipId,
      );

      return {
        ...state,
        timelineHistory,
        activeMediaId: selectedClip?.mediaId ?? state.activeMediaId,
      };
    }
  }
}

type DragMovementEvent = DragMoveEvent | DragOverEvent | DragEndEvent;

interface PointerProjection {
  clientX: number | null;
  offsetX: number | null;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.matches('input, textarea, select') ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null
  );
}

function getPointerProjection(
  event: DragMovementEvent,
  initialPointerClientX: number | null,
  pointerOffsetX: number | null,
): PointerProjection {
  const initialRectangle = event.active.rect.current.initial;
  const translatedRectangle = event.active.rect.current.translated;
  const resolvedOffsetX =
    pointerOffsetX ??
    (initialRectangle && initialPointerClientX !== null
      ? initialPointerClientX - initialRectangle.left
      : null);

  return {
    clientX:
      translatedRectangle && resolvedOffsetX !== null
        ? translatedRectangle.left + resolvedOffsetX
        : null,
    offsetX: resolvedOffsetX,
  };
}

function getMediaInsertionIndex(
  event: DragMovementEvent,
  clips: TimelineClip[],
  pointerX: number | null,
): number | null {
  if (!event.over) {
    return null;
  }

  if (event.over.id === timelineTrackDndId) {
    return clips.length;
  }

  const overData = readEditorDragData(event.over.data.current);

  if (overData?.type !== 'timeline-clip') {
    return null;
  }

  const overIndex = clips.findIndex((clip) => clip.id === overData.clipId);

  if (overIndex === -1) {
    return null;
  }

  if (pointerX === null) {
    return null;
  }

  const overCenter = event.over.rect.left + event.over.rect.width / 2;

  return overIndex + (pointerX >= overCenter ? 1 : 0);
}

function getTimelineOverIndex(event: DragEndEvent, clips: TimelineClip[]): number | null {
  if (!event.over) {
    return null;
  }

  const overData = readEditorDragData(event.over.data.current);

  return overData?.type === 'timeline-clip'
    ? clips.findIndex((clip) => clip.id === overData.clipId)
    : null;
}

function TopBar() {
  return (
    <header className="editor-topbar">
      <div className="editor-brand">
        <span className="editor-logo" aria-hidden="true">
          AG
        </span>
        <div>
          <strong>Trình chỉnh sửa video</strong>
          <span>Không gian làm việc cục bộ</span>
        </div>
      </div>

      <div className="project-title" aria-label="Tên dự án">
        Dự án chưa đặt tên
      </div>

      <div className="local-mode-badge">
        <span aria-hidden="true">●</span>
        Chỉ lưu trong trình duyệt
      </div>
    </header>
  );
}

function ToolRail() {
  return (
    <nav className="tool-rail" aria-label="Công cụ chỉnh sửa">
      <button className="tool-rail-item tool-rail-item-active" type="button" aria-current="page">
        <span className="tool-rail-icon" aria-hidden="true">
          ▣
        </span>
        <span>Phương tiện</span>
      </button>
      <button className="tool-rail-item" type="button" disabled>
        <span className="tool-rail-icon" aria-hidden="true">
          ♪
        </span>
        <span>Âm thanh</span>
      </button>
      <button className="tool-rail-item" type="button" disabled>
        <span className="tool-rail-icon tool-rail-text-icon" aria-hidden="true">
          T
        </span>
        <span>Văn bản</span>
      </button>
      <button className="tool-rail-item" type="button" disabled>
        <span className="tool-rail-icon" aria-hidden="true">
          ✦
        </span>
        <span>Hiệu ứng</span>
      </button>
    </nav>
  );
}

function PreviewWorkspace({ media, target }: PreviewWorkspaceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useLocalVideoPreview(videoRef, target);

  return (
    <section className="preview-workspace" aria-label="Khu vực xem trước">
      <div className="preview-toolbar">
        <div>
          <span className="panel-kicker">Xem trước</span>
          <strong>{media?.file.name ?? 'Chưa chọn video'}</strong>
        </div>
        <span className="preview-duration">{formatMediaDuration(media?.duration ?? null)}</span>
      </div>

      <div className="preview-stage">
        {media ? (
          <video ref={videoRef} className="local-video-player" preload="metadata" controls>
            Trình duyệt của bạn không hỗ trợ phát video.
          </video>
        ) : (
          <div className="preview-empty">
            <span className="preview-empty-icon" aria-hidden="true">
              ▶
            </span>
            <strong>Chọn video để xem trước</strong>
            <p>Video được phát trực tiếp từ file cục bộ trong trình duyệt.</p>
          </div>
        )}
      </div>

      <div className="preview-footer">
        <span>
          {media
            ? target?.mode === 'timeline'
              ? 'Đang xem theo vị trí dòng thời gian'
              : 'Đang xem video cục bộ'
            : 'Không có phương tiện đang chọn'}
        </span>
        <span>16:9</span>
      </div>
    </section>
  );
}

export function LocalVideoEditor() {
  const [editorState, dispatch] = useReducer(editorReducer, initialEditorState);
  const timelineHistory = editorState.timelineHistory;
  const timelineClips = timelineHistory.present.clips;
  const selectedClipId = timelineHistory.present.selectedClipId;
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
  const [activeDragData, setActiveDragData] = useState<EditorDragData | null>(null);
  const [mediaDropIndex, setMediaDropIndex] = useState<number | null>(null);
  const [currentTimelineTime, setCurrentTimelineTime] = useState(0);
  const [previewControlMode, setPreviewControlMode] = useState<PreviewControlMode>('library');
  const [previewRequestVersion, setPreviewRequestVersion] = useState(0);
  const filmstripFrameManager = useFilmstripFrameManager();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dndClickReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didDndDragRef = useRef(false);
  const initialPointerClientXRef = useRef<number | null>(null);
  const pointerOffsetXRef = useRef<number | null>(null);
  const processingQueueRef = useRef<LocalMediaItem[]>([]);
  const isProcessingQueueRef = useRef(false);
  const isMountedRef = useRef(true);
  const resourcesRef = useRef(new Map<string, ManagedMediaResource>());
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  useEffect(() => {
    const resources = resourcesRef.current;
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      processingQueueRef.current = [];

      for (const resource of resources.values()) {
        resource.abortController.abort();
        URL.revokeObjectURL(resource.objectUrl);

        if (resource.thumbnailUrl) {
          URL.revokeObjectURL(resource.thumbnailUrl);
        }
      }

      resources.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (dndClickReleaseTimerRef.current !== null) {
        clearTimeout(dndClickReleaseTimerRef.current);
      }
    };
  }, []);

  const processMediaQueue = () => {
    if (isProcessingQueueRef.current) {
      return;
    }

    isProcessingQueueRef.current = true;

    void (async () => {
      try {
        while (processingQueueRef.current.length > 0 && isMountedRef.current) {
          const item = processingQueueRef.current.shift();

          if (!item) {
            continue;
          }

          const resource = resourcesRef.current.get(item.id);

          if (!resource) {
            continue;
          }

          try {
            const duration = await readLocalVideoDuration(
              resource.objectUrl,
              resource.abortController.signal,
            );

            if (!isMountedRef.current || resourcesRef.current.get(item.id) !== resource) {
              continue;
            }

            dispatch({ type: 'update-media', id: item.id, changes: { duration } });

            const thumbnailBlob = await createLocalVideoThumbnail(
              resource.objectUrl,
              duration,
              resource.abortController.signal,
            );

            if (!isMountedRef.current || resourcesRef.current.get(item.id) !== resource) {
              continue;
            }

            const thumbnailUrl = URL.createObjectURL(thumbnailBlob);
            resource.thumbnailUrl = thumbnailUrl;
            dispatch({
              type: 'update-media',
              id: item.id,
              changes: { thumbnailUrl, status: 'ready', errorMessage: null },
            });
          } catch (error) {
            if (
              !isAbortError(error) &&
              isMountedRef.current &&
              resourcesRef.current.get(item.id) === resource
            ) {
              dispatch({
                type: 'update-media',
                id: item.id,
                changes: { status: 'error', errorMessage: getLocalMediaErrorMessage(error) },
              });
            }
          }
        }
      } finally {
        isProcessingQueueRef.current = false;

        if (processingQueueRef.current.length > 0 && isMountedRef.current) {
          processMediaQueue();
        }
      }
    })();
  };

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';

    if (selectedFiles.length === 0) {
      return;
    }

    const validFiles = selectedFiles.filter(isMp4File);
    const invalidFileCount = selectedFiles.length - validFiles.length;

    if (validFiles.length === 0) {
      setLibraryMessage(`Không có tệp MP4 hợp lệ. Đã bỏ qua ${invalidFileCount} tệp.`);
      return;
    }

    const items = validFiles.map<LocalMediaItem>((file) => {
      const id = crypto.randomUUID();
      const objectUrl = URL.createObjectURL(file);

      resourcesRef.current.set(id, {
        objectUrl,
        thumbnailUrl: null,
        abortController: new AbortController(),
      });

      return {
        id,
        file,
        objectUrl,
        duration: null,
        thumbnailUrl: null,
        status: 'processing',
        errorMessage: null,
      };
    });

    dispatch({ type: 'add-media', items });
    processingQueueRef.current.push(...items);
    processMediaQueue();

    const acceptedMessage = `Đã thêm ${items.length} video vào thư viện cục bộ.`;
    setLibraryMessage(
      invalidFileCount > 0
        ? `${acceptedMessage} Đã bỏ qua ${invalidFileCount} tệp không hợp lệ.`
        : acceptedMessage,
    );
  };

  const handleRemove = (id: string) => {
    if (timelineClips.some((clip) => clip.mediaId === id)) {
      setLibraryMessage('Video này đang được sử dụng trong dòng thời gian.');
      return;
    }

    filmstripFrameManager.removeMedia(id);
    const resource = resourcesRef.current.get(id);

    if (resource) {
      resource.abortController.abort();
      URL.revokeObjectURL(resource.objectUrl);

      if (resource.thumbnailUrl) {
        URL.revokeObjectURL(resource.thumbnailUrl);
      }

      resourcesRef.current.delete(id);
    }

    processingQueueRef.current = processingQueueRef.current.filter((item) => item.id !== id);
    dispatch({ type: 'remove-media', id });
    setLibraryMessage(null);
  };

  const clearDragState = () => {
    setActiveDragData(null);
    setMediaDropIndex(null);
    initialPointerClientXRef.current = null;
    pointerOffsetXRef.current = null;
  };

  const scheduleDndClickRelease = () => {
    if (dndClickReleaseTimerRef.current !== null) {
      clearTimeout(dndClickReleaseTimerRef.current);
    }

    dndClickReleaseTimerRef.current = setTimeout(() => {
      didDndDragRef.current = false;
      dndClickReleaseTimerRef.current = null;
    }, 0);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const dragData = readEditorDragData(event.active.data.current);

    if (dndClickReleaseTimerRef.current !== null) {
      clearTimeout(dndClickReleaseTimerRef.current);
      dndClickReleaseTimerRef.current = null;
    }

    didDndDragRef.current = true;
    initialPointerClientXRef.current =
      event.activatorEvent instanceof MouseEvent ? event.activatorEvent.clientX : null;

    pointerOffsetXRef.current = null;
    setActiveDragData(dragData);
    setMediaDropIndex(null);
  };

  const getMediaPointerClientX = (event: DragMovementEvent) => {
    const projection = getPointerProjection(
      event,
      initialPointerClientXRef.current,
      pointerOffsetXRef.current,
    );

    pointerOffsetXRef.current = projection.offsetX;
    return projection.clientX;
  };

  const updateMediaDropIndex = (event: DragMoveEvent | DragOverEvent) => {
    const dragData = readEditorDragData(event.active.data.current);

    if (dragData?.type !== 'media') {
      return;
    }

    const pointerX = getMediaPointerClientX(event);
    setMediaDropIndex(getMediaInsertionIndex(event, timelineClips, pointerX));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const dragData = readEditorDragData(event.active.data.current);
    let timelineChanged = false;

    if (!dragData) {
      clearDragState();
      scheduleDndClickRelease();
      return;
    }

    if (dragData.type === 'media') {
      const pointerX = getMediaPointerClientX(event);
      const insertionIndex = getMediaInsertionIndex(event, timelineClips, pointerX);
      const media = editorState.mediaItems.find((item) => item.id === dragData.mediaId);
      const clip = media?.status === 'ready' ? createTimelineClip(media.id, media.duration) : null;

      if (clip && insertionIndex !== null) {
        dispatch({ type: 'add-timeline-clip', clip, insertionIndex });
        timelineChanged = true;
      }
    } else {
      const activeIndex = timelineClips.findIndex((clip) => clip.id === dragData.clipId);
      const overIndex = getTimelineOverIndex(event, timelineClips);

      if (
        activeIndex !== -1 &&
        overIndex !== null &&
        overIndex !== -1 &&
        activeIndex !== overIndex
      ) {
        dispatch({
          type: 'reorder-timeline-clips',
          clips: arrayMove(timelineClips, activeIndex, overIndex),
        });
        timelineChanged = true;
      }
    }

    if (timelineChanged) {
      setPreviewControlMode('timeline');
      setPreviewRequestVersion((version) => version + 1);
    }

    clearDragState();
    scheduleDndClickRelease();
  };

  const handleDragCancel = () => {
    clearDragState();
    scheduleDndClickRelease();
  };

  const timelineDuration = getTimelineDuration(timelineClips);
  const safeTimelineTime = clampTimelineTime(currentTimelineTime, timelineDuration);
  const mediaDurations = useMemo(
    () => new Map(editorState.mediaItems.map((media) => [media.id, media.duration])),
    [editorState.mediaItems],
  );
  const timelinePosition = useMemo(
    () => getTimelinePositionAtTime(timelineClips, safeTimelineTime, mediaDurations),
    [timelineClips, mediaDurations, safeTimelineTime],
  );
  const selectedTimelineClip = timelineClips.find((clip) => clip.id === selectedClipId) ?? null;
  const selectedSplitSourceTime = selectedClipId
    ? getTimelineSplitSourceTime(timelineClips, selectedClipId, safeTimelineTime)
    : null;
  const isTrimTransactionActive = timelineHistory.trimTransactionStart !== null;
  const canUndoTimeline = timelineHistory.past.length > 0 && !isTrimTransactionActive;
  const canRedoTimeline = timelineHistory.future.length > 0 && !isTrimTransactionActive;
  const libraryMedia =
    editorState.mediaItems.find((item) => item.id === editorState.activeMediaId) ?? null;
  const timelineMedia =
    editorState.mediaItems.find((item) => item.id === timelinePosition?.clip.mediaId) ?? null;
  const previewMedia = previewControlMode === 'timeline' ? timelineMedia : libraryMedia;
  const previewTarget = useMemo<LocalVideoPreviewTarget | null>(() => {
    if (!previewMedia) {
      return null;
    }

    return {
      mediaId: previewMedia.id,
      objectUrl: previewMedia.objectUrl,
      mode: previewControlMode,
      requestVersion: previewRequestVersion,
      sourceTime: previewControlMode === 'timeline' ? (timelinePosition?.sourceTime ?? null) : null,
    };
  }, [previewControlMode, previewMedia, previewRequestVersion, timelinePosition?.sourceTime]);

  const handleLibrarySelect = (id: string) => {
    if (didDndDragRef.current) {
      return;
    }

    dispatch({ type: 'select-media', id });
    setPreviewControlMode('library');
  };

  const handleTimelineSeek = (time: number) => {
    if (didDndDragRef.current) {
      return;
    }

    setCurrentTimelineTime(clampTimelineTime(time, timelineDuration));
    setPreviewControlMode('timeline');
    setPreviewRequestVersion((version) => version + 1);
  };

  const handleTimelineClipSelect = (clip: TimelineClip) => {
    if (!didDndDragRef.current) {
      dispatch({ type: 'select-timeline-clip', clip });
    }
  };

  const handleTimelineTrimStart = (clip: TimelineClip) => {
    dispatch({ type: 'begin-timeline-trim', clipId: clip.id });
    setPreviewControlMode('timeline');
  };

  const handleTimelineTrimCommit = () => {
    dispatch({ type: 'commit-timeline-trim' });
    setPreviewControlMode('timeline');
    setPreviewRequestVersion((version) => version + 1);
  };

  const handleTimelineTrimCancel = () => {
    dispatch({ type: 'cancel-timeline-trim' });
    setPreviewControlMode('timeline');
    setPreviewRequestVersion((version) => version + 1);
  };

  const handleTimelineClipTrim = (
    clipId: string,
    edge: TimelineTrimEdge,
    requestedSourceTime: number,
    mediaDuration: number,
  ) => {
    const currentClip = timelineClips.find((clip) => clip.id === clipId);

    if (!currentClip) {
      return;
    }

    const trimmedClip = trimTimelineClip(currentClip, edge, requestedSourceTime, mediaDuration);
    const nextTimelineDuration =
      timelineDuration -
      getTimelineClipDuration(currentClip) +
      getTimelineClipDuration(trimmedClip);

    dispatch({
      type: 'trim-timeline-clip',
      clipId,
      edge,
      requestedSourceTime,
      mediaDuration,
    });
    setCurrentTimelineTime((time) => clampTimelineTime(time, nextTimelineDuration));
    setPreviewControlMode('timeline');
  };

  const handleSplitSelectedClip = () => {
    if (!selectedTimelineClip || selectedSplitSourceTime === null) {
      return;
    }

    dispatch({
      type: 'split-timeline-clip',
      clipId: selectedTimelineClip.id,
      sourceTime: selectedSplitSourceTime,
      leftClipId: crypto.randomUUID(),
      rightClipId: crypto.randomUUID(),
    });
    setPreviewControlMode('timeline');
    setPreviewRequestVersion((version) => version + 1);
  };

  const handleDeleteSelectedClip = () => {
    if (!selectedTimelineClip) {
      return;
    }

    const nextTimelineClips = deleteTimelineClip(timelineClips, selectedTimelineClip.id);

    dispatch({ type: 'delete-timeline-clip', clipId: selectedTimelineClip.id });
    setCurrentTimelineTime((time) =>
      clampTimelineTime(time, getTimelineDuration(nextTimelineClips)),
    );
    setPreviewControlMode('timeline');
    setPreviewRequestVersion((version) => version + 1);
  };

  const handleUndoTimeline = useCallback(() => {
    const previousSnapshot = timelineHistory.past.at(-1);

    if (!previousSnapshot || timelineHistory.trimTransactionStart) {
      return;
    }

    dispatch({ type: 'undo-timeline-edit' });
    setCurrentTimelineTime((time) =>
      clampTimelineTime(time, getTimelineDuration(previousSnapshot.clips)),
    );
    setPreviewControlMode('timeline');
    setPreviewRequestVersion((version) => version + 1);
  }, [timelineHistory]);

  const handleRedoTimeline = useCallback(() => {
    const nextSnapshot = timelineHistory.future[0];

    if (!nextSnapshot || timelineHistory.trimTransactionStart) {
      return;
    }

    dispatch({ type: 'redo-timeline-edit' });
    setCurrentTimelineTime((time) =>
      clampTimelineTime(time, getTimelineDuration(nextSnapshot.clips)),
    );
    setPreviewControlMode('timeline');
    setPreviewRequestVersion((version) => version + 1);
  }, [timelineHistory]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || isEditableKeyboardTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasPrimaryModifier = event.ctrlKey || event.metaKey;
      const isUndo = hasPrimaryModifier && key === 'z' && !event.shiftKey;
      const isShiftRedo = hasPrimaryModifier && key === 'z' && event.shiftKey;
      const isWindowsRedo = event.ctrlKey && !event.metaKey && key === 'y' && !event.shiftKey;

      if (isUndo && canUndoTimeline) {
        event.preventDefault();
        handleUndoTimeline();
      } else if ((isShiftRedo || isWindowsRedo) && canRedoTimeline) {
        event.preventDefault();
        handleRedoTimeline();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canRedoTimeline, canUndoTimeline, handleRedoTimeline, handleUndoTimeline]);

  return (
    <main className="editor-shell">
      <TopBar />
      <DndContext
        sensors={sensors}
        collisionDetection={editorCollisionDetection}
        onDragStart={handleDragStart}
        onDragMove={updateMediaDropIndex}
        onDragOver={updateMediaDropIndex}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <div className="editor-body">
          <div className="editor-upper-workspace">
            <ToolRail />
            <MediaLibrary
              mediaItems={editorState.mediaItems}
              activeMediaId={editorState.activeMediaId}
              libraryMessage={libraryMessage}
              fileInputRef={fileInputRef}
              onImport={handleImport}
              onSelect={handleLibrarySelect}
              onRemove={handleRemove}
            />
            <PreviewWorkspace media={previewMedia} target={previewTarget} />
          </div>
          <EditorTimeline
            clips={timelineClips}
            mediaItems={editorState.mediaItems}
            selectedClipId={selectedClipId}
            mediaDropIndex={mediaDropIndex}
            filmstripManager={filmstripFrameManager}
            currentTimelineTime={safeTimelineTime}
            canDeleteSelectedClip={selectedTimelineClip !== null && !isTrimTransactionActive}
            canRedo={canRedoTimeline}
            canSplitSelectedClip={selectedSplitSourceTime !== null && !isTrimTransactionActive}
            canUndo={canUndoTimeline}
            onDeleteSelectedClip={handleDeleteSelectedClip}
            onRedo={handleRedoTimeline}
            onSeek={handleTimelineSeek}
            onSelectClip={handleTimelineClipSelect}
            onSplitSelectedClip={handleSplitSelectedClip}
            onTrimCancel={handleTimelineTrimCancel}
            onTrimCommit={handleTimelineTrimCommit}
            onTrimClip={handleTimelineClipTrim}
            onTrimStart={handleTimelineTrimStart}
            onUndo={handleUndoTimeline}
          />
        </div>

        <DragOverlay adjustScale={false}>
          <EditorDragOverlay
            dragData={activeDragData}
            mediaItems={editorState.mediaItems}
            timelineClips={timelineClips}
          />
        </DragOverlay>
      </DndContext>
    </main>
  );
}
