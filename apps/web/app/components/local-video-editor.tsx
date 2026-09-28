'use client';

import type { ChangeEvent, RefObject } from 'react';
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  createLocalVideoThumbnail,
  formatMediaDuration,
  formatMediaFileSize,
  getLocalMediaErrorMessage,
  isAbortError,
  isMp4File,
  readLocalVideoDuration,
  type LocalMediaItem,
  type LocalMediaStatus,
} from '../lib/local-media';

interface EditorState {
  mediaItems: LocalMediaItem[];
  activeMediaId: string | null;
}

type MediaItemChanges = Partial<
  Pick<LocalMediaItem, 'duration' | 'thumbnailUrl' | 'status' | 'errorMessage'>
>;

type EditorAction =
  | { type: 'add-media'; items: LocalMediaItem[] }
  | { type: 'update-media'; id: string; changes: MediaItemChanges }
  | { type: 'select-media'; id: string }
  | { type: 'remove-media'; id: string };

interface ManagedMediaResource {
  objectUrl: string;
  thumbnailUrl: string | null;
  abortController: AbortController;
}

interface MediaLibraryProps {
  mediaItems: LocalMediaItem[];
  activeMediaId: string | null;
  importMessage: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

interface PreviewWorkspaceProps {
  activeMedia: LocalMediaItem | null;
}

const initialEditorState: EditorState = {
  mediaItems: [],
  activeMediaId: null,
};

const mediaStatusLabels: Record<LocalMediaStatus, string> = {
  processing: 'Đang xử lý',
  ready: 'Sẵn sàng',
  error: 'Lỗi ảnh xem trước',
};

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'add-media':
      return {
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

      return { mediaItems, activeMediaId };
    }
  }
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

function MediaThumbnail({ item }: { item: LocalMediaItem }) {
  return (
    <div className="media-thumbnail">
      {item.thumbnailUrl ? (
        <div
          className="media-thumbnail-image"
          role="img"
          aria-label={`Ảnh xem trước của ${item.file.name}`}
          style={{ backgroundImage: `url(${item.thumbnailUrl})` }}
        />
      ) : (
        <div className="media-thumbnail-placeholder" aria-hidden="true">
          {item.status === 'processing' ? <span className="processing-spinner" /> : <span>▶</span>}
        </div>
      )}
      <span className="media-duration-badge">{formatMediaDuration(item.duration)}</span>
    </div>
  );
}

function MediaLibraryItem({
  item,
  isActive,
  onSelect,
  onRemove,
}: {
  item: LocalMediaItem;
  isActive: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <li className={`media-item${isActive ? ' media-item-active' : ''}`}>
      <button className="media-item-select" type="button" onClick={() => onSelect(item.id)}>
        <MediaThumbnail item={item} />
        <span className="media-item-details">
          <strong title={item.file.name}>{item.file.name}</strong>
          <span>{formatMediaFileSize(item.file.size)}</span>
          <span className={`media-item-status media-item-status-${item.status}`}>
            <i aria-hidden="true" />
            {mediaStatusLabels[item.status]}
          </span>
          {item.errorMessage ? <small>{item.errorMessage}</small> : null}
        </span>
      </button>
      <button
        className="media-remove-button"
        type="button"
        aria-label={`Xóa ${item.file.name}`}
        title="Xóa khỏi thư viện"
        onClick={() => onRemove(item.id)}
      >
        ×
      </button>
    </li>
  );
}

function MediaLibrary({
  mediaItems,
  activeMediaId,
  importMessage,
  fileInputRef,
  onImport,
  onSelect,
  onRemove,
}: MediaLibraryProps) {
  return (
    <aside className="media-library" aria-label="Thư viện phương tiện">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">Thư viện</span>
          <h1>Phương tiện cục bộ</h1>
        </div>
        <span className="media-count">{mediaItems.length}</span>
      </div>

      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="video/mp4,.mp4"
        multiple
        onChange={onImport}
      />
      <button
        className="import-media-button"
        type="button"
        onClick={() => fileInputRef.current?.click()}
      >
        <span aria-hidden="true">＋</span>
        Nhập video MP4
      </button>
      <p className="media-library-hint">Tệp chỉ được giữ cục bộ và không tải lên máy chủ.</p>

      {importMessage ? (
        <p className="import-message" role="status">
          {importMessage}
        </p>
      ) : null}

      {mediaItems.length > 0 ? (
        <ul className="media-list">
          {mediaItems.map((item) => (
            <MediaLibraryItem
              key={item.id}
              item={item}
              isActive={item.id === activeMediaId}
              onSelect={onSelect}
              onRemove={onRemove}
            />
          ))}
        </ul>
      ) : (
        <div className="media-library-empty">
          <span aria-hidden="true">▧</span>
          <strong>Chưa có video</strong>
          <p>Nhập một hoặc nhiều tệp MP4 để bắt đầu.</p>
        </div>
      )}
    </aside>
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

function TimelineShell() {
  const rulerLabels = ['00:00', '00:05', '00:10', '00:15', '00:20', '00:25'];

  return (
    <section className="timeline-shell" aria-label="Dòng thời gian">
      <div className="timeline-toolbar-shell">
        <strong>Dòng thời gian</strong>
        <div className="timeline-actions-shell">
          <button type="button" disabled>
            <span aria-hidden="true">✂</span>
            Tách
          </button>
          <button type="button" disabled>
            <span aria-hidden="true">⌫</span>
            Xóa
          </button>
        </div>
        <span className="timeline-phase-badge">Chưa có clip</span>
      </div>

      <div className="timeline-content-shell">
        <div className="timeline-track-label">
          <span aria-hidden="true">▣</span>
          <strong>Video 1</strong>
        </div>
        <div className="timeline-track-area">
          <div className="timeline-ruler" aria-hidden="true">
            {rulerLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="empty-video-track">
            <span aria-hidden="true">＋</span>
            <div>
              <strong>Dòng thời gian đang trống</strong>
              <p>Đoạn video sẽ được thêm trong giai đoạn tiếp theo.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LocalVideoEditor() {
  const [editorState, dispatch] = useReducer(editorReducer, initialEditorState);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingQueueRef = useRef<LocalMediaItem[]>([]);
  const isProcessingQueueRef = useRef(false);
  const isMountedRef = useRef(true);
  const resourcesRef = useRef(new Map<string, ManagedMediaResource>());

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
      setImportMessage(`Không có tệp MP4 hợp lệ. Đã bỏ qua ${invalidFileCount} tệp.`);
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
    setImportMessage(
      invalidFileCount > 0
        ? `${acceptedMessage} Đã bỏ qua ${invalidFileCount} tệp không hợp lệ.`
        : acceptedMessage,
    );
  };

  const handleRemove = (id: string) => {
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
  };

  const activeMedia =
    editorState.mediaItems.find((item) => item.id === editorState.activeMediaId) ?? null;

  return (
    <main className="editor-shell">
      <TopBar />
      <div className="editor-body">
        <div className="editor-upper-workspace">
          <ToolRail />
          <MediaLibrary
            mediaItems={editorState.mediaItems}
            activeMediaId={editorState.activeMediaId}
            importMessage={importMessage}
            fileInputRef={fileInputRef}
            onImport={handleImport}
            onSelect={(id) => dispatch({ type: 'select-media', id })}
            onRemove={handleRemove}
          />
          <PreviewWorkspace activeMedia={activeMedia} />
        </div>
        <TimelineShell />
      </div>
    </main>
  );
}
