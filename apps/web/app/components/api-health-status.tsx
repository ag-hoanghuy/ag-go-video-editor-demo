'use client';

import type { HealthResponse } from '@ag-go-video-editor/shared';
import { useEffect, useState } from 'react';

type ApiStatus = 'checking' | 'online' | 'offline';

const statusLabels: Record<ApiStatus, string> = {
  checking: 'Đang kiểm tra...',
  online: 'Đang hoạt động',
  offline: 'Không thể kết nối',
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function isApiAvailable(signal: AbortSignal): Promise<boolean> {
  const response = await fetch(`${apiUrl}/health`, { signal });

  if (!response.ok) {
    return false;
  }

  const healthResponse: HealthResponse = await response.json();
  return healthResponse.status === 'ok';
}

export function ApiHealthStatus() {
  const [status, setStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    const abortController = new AbortController();

    void isApiAvailable(abortController.signal)
      .then((isAvailable) => setStatus(isAvailable ? 'online' : 'offline'))
      .catch(() => {
        if (!abortController.signal.aborted) {
          setStatus('offline');
        }
      });

    return () => abortController.abort();
  }, []);

  return (
    <p className={`status status-${status}`} role="status" aria-live="polite">
      Trạng thái API: {statusLabels[status]}
    </p>
  );
}
