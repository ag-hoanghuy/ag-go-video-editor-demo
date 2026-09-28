import { useDraggable } from '@dnd-kit/core';
import type { ChangeEvent, RefObject } from 'react';
import { getMediaDndId, type EditorDragData } from '../lib/editor-dnd';
import {
  formatMediaDuration,
  formatMediaFileSize,
  type LocalMediaItem,
  type LocalMediaStatus,
} from '../lib/local-media';

interface MediaLibraryProps {
  mediaItems: LocalMediaItem[];
  activeMediaId: string | null;
  libraryMessage: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

const mediaStatusLabels: Record<LocalMediaStatus, string> = {
  processing: 'Đang xử lý',
  ready: 'Sẵn sàng',
  error: 'Lỗi ảnh xem trước',
};

function isMediaDraggable(item: LocalMediaItem): boolean {
  return item.status === 'ready' && item.duration !== null && item.duration > 0;
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
  const canDrag = isMediaDraggable(item);
  const dragData = { type: 'media', mediaId: item.id } satisfies EditorDragData;
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    id: getMediaDndId(item.id),
    data: dragData,
    disabled: !canDrag,
  });

  return (
    <li
      ref={setNodeRef}
      className={`media-item${isActive ? ' media-item-active' : ''}${
        canDrag ? ' media-item-draggable' : ''
      }${isDragging ? ' media-item-dragging' : ''}`}
    >
      <button
        className="media-item-select"
        type="button"
        onClick={() => onSelect(item.id)}
        {...attributes}
        {...listeners}
      >
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

export function MediaLibrary({
  mediaItems,
  activeMediaId,
  libraryMessage,
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
      <p className="media-library-hint">
        Kéo video sẵn sàng xuống dòng thời gian. Tệp không được tải lên máy chủ.
      </p>

      {libraryMessage ? (
        <p className="import-message" role="status">
          {libraryMessage}
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
