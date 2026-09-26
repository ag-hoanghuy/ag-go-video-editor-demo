'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useState } from 'react';
import { requestAssetUploadUrl, uploadVideoToR2 } from '../lib/video-upload';

type UploadPhase = 'empty' | 'ready' | 'preparing' | 'uploading' | 'success' | 'failure';

interface UploadedAsset {
  assetId: string;
  objectKey: string;
}

interface UploadState {
  phase: UploadPhase;
  progress: number;
  errorMessage?: string;
  uploadedAsset?: UploadedAsset;
}

const phaseLabels: Record<UploadPhase, string> = {
  empty: 'Chưa chọn file',
  ready: 'Sẵn sàng tải lên',
  preparing: 'Đang chuẩn bị tải lên...',
  uploading: 'Đang tải lên...',
  success: 'Tải lên thành công',
  failure: 'Tải lên thất bại',
};

const initialUploadState: UploadState = {
  phase: 'empty',
  progress: 0,
};

function validateVideoFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.mp4')) {
    return 'Tệp đã chọn phải có phần mở rộng .mp4.';
  }

  if (file.type !== 'video/mp4') {
    return 'Tệp đã chọn phải có MIME video/mp4.';
  }

  return null;
}

function formatFileSize(bytes: number): string {
  const formatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 ** 2) {
    return `${formatter.format(bytes / 1024)} KB`;
  }

  if (bytes < 1024 ** 3) {
    return `${formatter.format(bytes / 1024 ** 2)} MB`;
  }

  return `${formatter.format(bytes / 1024 ** 3)} GB`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định khi tải lên.';
}

export function VideoUploader() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>(initialUploadState);
  const isBusy = uploadState.phase === 'preparing' || uploadState.phase === 'uploading';

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];

    if (!file) {
      setSelectedFile(null);
      setUploadState(initialUploadState);
      return;
    }

    const validationMessage = validateVideoFile(file);

    if (validationMessage) {
      event.target.value = '';
      setSelectedFile(null);
      setUploadState({
        phase: 'failure',
        progress: 0,
        errorMessage: validationMessage,
      });
      return;
    }

    setSelectedFile(file);
    setUploadState({ phase: 'ready', progress: 0 });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedFile || isBusy) {
      return;
    }

    setUploadState({ phase: 'preparing', progress: 0 });

    try {
      const uploadDetails = await requestAssetUploadUrl(selectedFile.name);
      setUploadState({ phase: 'uploading', progress: 0 });
      await uploadVideoToR2(selectedFile, uploadDetails.uploadUrl, (progress) => {
        setUploadState((currentState) => ({ ...currentState, progress }));
      });
      setUploadState({
        phase: 'success',
        progress: 100,
        uploadedAsset: {
          assetId: uploadDetails.assetId,
          objectKey: uploadDetails.objectKey,
        },
      });
    } catch (error) {
      setUploadState((currentState) => ({
        ...currentState,
        phase: 'failure',
        errorMessage: getErrorMessage(error),
      }));
    }
  }

  return (
    <section className="upload-panel" aria-labelledby="upload-heading">
      <div className="upload-heading-group">
        <div>
          <p className="section-label">Upload trực tiếp lên R2</p>
          <h2 id="upload-heading">Chọn video MP4</h2>
        </div>
        <span className={`upload-status upload-status-${uploadState.phase}`} role="status">
          {phaseLabels[uploadState.phase]}
        </span>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <label className={`file-picker${isBusy ? ' file-picker-disabled' : ''}`}>
          <span>Chọn file video</span>
          <span className="file-picker-action">Chọn tệp MP4</span>
          <input
            type="file"
            accept="video/mp4,.mp4"
            onChange={handleFileChange}
            disabled={isBusy}
          />
        </label>

        {selectedFile ? (
          <div className="file-details">
            <div>
              <span className="detail-label">Tên file</span>
              <strong>{selectedFile.name}</strong>
            </div>
            <div>
              <span className="detail-label">Dung lượng</span>
              <strong>{formatFileSize(selectedFile.size)}</strong>
            </div>
          </div>
        ) : (
          <p className="empty-file-message">Chưa có file MP4 nào được chọn.</p>
        )}

        <div className="progress-group">
          <div className="progress-label">
            <span>Tiến trình tải lên</span>
            <strong>{uploadState.progress}%</strong>
          </div>
          <progress value={uploadState.progress} max="100">
            {uploadState.progress}%
          </progress>
        </div>

        {uploadState.errorMessage ? (
          <p className="upload-message upload-message-error">{uploadState.errorMessage}</p>
        ) : null}

        {uploadState.uploadedAsset ? (
          <dl className="asset-details">
            <div>
              <dt>Asset ID</dt>
              <dd>{uploadState.uploadedAsset.assetId}</dd>
            </div>
            <div>
              <dt>Object key</dt>
              <dd>{uploadState.uploadedAsset.objectKey}</dd>
            </div>
          </dl>
        ) : null}

        <button type="submit" disabled={!selectedFile || isBusy}>
          {isBusy ? 'Đang xử lý...' : 'Tải video lên R2'}
        </button>
      </form>
    </section>
  );
}
