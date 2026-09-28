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
import { useEffect, useReducer, useRef, useState } from 'react';
import { EditorDragOverlay } from './editor-drag-overlay';
import { EditorTimeline } from './editor-timeline';
import { MediaLibrary } from './media-library';
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
import { createTimelineClip, insertTimelineClip, type TimelineClip } from '../lib/timeline';

interface EditorState {
  mediaItems: LocalMediaItem[];
  activeMediaId: string | null;
  timelineClips: TimelineClip[];
  selectedClipId: string | null;
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
  | { type: 'select-timeline-clip'; clip: TimelineClip };

interface ManagedMediaResource {
  objectUrl: string;
  thumbnailUrl: string | null;
  abortController: AbortController;
}

interface PreviewWorkspaceProps {
  activeMedia: LocalMediaItem | null;
}

const initialEditorState: EditorState = {
  mediaItems: [],
  activeMediaId: null,
  timelineClips: [],
  selectedClipId: null,
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

      return { ...state, mediaItems, activeMediaId };
    }
    case 'add-timeline-clip':
      return {
        ...state,
        timelineClips: insertTimelineClip(state.timelineClips, action.clip, action.insertionIndex),
        selectedClipId: action.clip.id,
        activeMediaId: action.clip.mediaId,
      };
    case 'reorder-timeline-clips':
      return { ...state, timelineClips: action.clips };
    case 'select-timeline-clip':
      return state.timelineClips.some((clip) => clip.id === action.clip.id)
        ? {
            ...state,
            selectedClipId: action.clip.id,
            activeMediaId: action.clip.mediaId,
          }
        : state;
  }
}

type DragMovementEvent = DragMoveEvent | DragOverEvent | DragEndEvent;

interface PointerProjection {
  clientX: number | null;
  offsetX: number | null;
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

function PreviewWorkspace({ activeMedia }: PreviewWorkspaceProps) {
  return (
    <section className="preview-workspace" aria-label="Khu vực xem trước">
      <div className="preview-toolbar">
        <div>
          <span className="panel-kicker">Xem trước</span>
          <strong>{activeMedia?.file.name ?? 'Chưa chọn video'}</strong>
        </div>
        <span className="preview-duration">
          {formatMediaDuration(activeMedia?.duration ?? null)}
        </span>
      </div>

      <div className="preview-stage">
        {activeMedia ? (
          <video
            key={activeMedia.id}
            className="local-video-player"
            src={activeMedia.objectUrl}
            preload="metadata"
            controls
          >
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
        <span>{activeMedia ? 'Đang xem video cục bộ' : 'Không có phương tiện đang chọn'}</span>
        <span>16:9</span>
      </div>
    </section>
  );
}

export function LocalVideoEditor() {
  const [editorState, dispatch] = useReducer(editorReducer, initialEditorState);
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
  const [activeDragData, setActiveDragData] = useState<EditorDragData | null>(null);
  const [mediaDropIndex, setMediaDropIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    if (editorState.timelineClips.some((clip) => clip.mediaId === id)) {
      setLibraryMessage('Video này đang được sử dụng trong dòng thời gian.');
      return;
    }

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

  const handleDragStart = (event: DragStartEvent) => {
    const dragData = readEditorDragData(event.active.data.current);
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
    setMediaDropIndex(getMediaInsertionIndex(event, editorState.timelineClips, pointerX));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const dragData = readEditorDragData(event.active.data.current);

    if (!dragData) {
      clearDragState();
      return;
    }

    if (dragData.type === 'media') {
      const pointerX = getMediaPointerClientX(event);
      const insertionIndex = getMediaInsertionIndex(event, editorState.timelineClips, pointerX);
      const media = editorState.mediaItems.find((item) => item.id === dragData.mediaId);
      const clip = media?.status === 'ready' ? createTimelineClip(media.id, media.duration) : null;

      if (clip && insertionIndex !== null) {
        dispatch({ type: 'add-timeline-clip', clip, insertionIndex });
      }
    } else {
      const activeIndex = editorState.timelineClips.findIndex(
        (clip) => clip.id === dragData.clipId,
      );
      const overIndex = getTimelineOverIndex(event, editorState.timelineClips);

      if (
        activeIndex !== -1 &&
        overIndex !== null &&
        overIndex !== -1 &&
        activeIndex !== overIndex
      ) {
        dispatch({
          type: 'reorder-timeline-clips',
          clips: arrayMove(editorState.timelineClips, activeIndex, overIndex),
        });
      }
    }

    clearDragState();
  };

  const activeMedia =
    editorState.mediaItems.find((item) => item.id === editorState.activeMediaId) ?? null;

  return (
    <main className="editor-shell">
      <TopBar />
      <DndContext
        sensors={sensors}
        collisionDetection={editorCollisionDetection}
        onDragStart={handleDragStart}
        onDragMove={updateMediaDropIndex}
        onDragOver={updateMediaDropIndex}
        onDragCancel={clearDragState}
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
              onSelect={(id) => dispatch({ type: 'select-media', id })}
              onRemove={handleRemove}
            />
            <PreviewWorkspace activeMedia={activeMedia} />
          </div>
          <EditorTimeline
            clips={editorState.timelineClips}
            mediaItems={editorState.mediaItems}
            selectedClipId={editorState.selectedClipId}
            mediaDropIndex={mediaDropIndex}
            onSelectClip={(clip) => dispatch({ type: 'select-timeline-clip', clip })}
          />
        </div>

        <DragOverlay adjustScale={false}>
          <EditorDragOverlay
            dragData={activeDragData}
            mediaItems={editorState.mediaItems}
            timelineClips={editorState.timelineClips}
          />
        </DragOverlay>
      </DndContext>
    </main>
  );
}
