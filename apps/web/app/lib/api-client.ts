const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ApiResponse {
  body: unknown;
  ok: boolean;
  status: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getApiErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.message === 'string') {
    return value.message;
  }

  if (Array.isArray(value.message) && value.message.every((item) => typeof item === 'string')) {
    return value.message.join(' ');
  }

  return typeof value.error === 'string' ? value.error : null;
}

export async function requestApi(
  path: string,
  options: RequestInit,
  connectionErrorMessage: string,
): Promise<ApiResponse> {
  let response: Response;

  try {
    response = await fetch(`${apiUrl}${path}`, options);
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }

    throw new Error(connectionErrorMessage);
  }

  return {
    body: await response.json().catch(() => null),
    ok: response.ok,
    status: response.status,
  };
}
