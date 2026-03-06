import { API_BASE_URL } from '@/lib/constants';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Typed fetch wrapper for BFF API routes. Expects `{ data: T }` envelope. */
export async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });
  } catch {
    throw new ApiError('Connection lost — check your internet and try again', 0);
  }

  const json: unknown = await response.json();

  if (!response.ok) {
    // BFF always returns { error: string } — safe to cast after checking !response.ok
    const errorBody = json as { error?: string };
    throw new ApiError(
      errorBody?.error ?? `Request failed with status ${response.status}`,
      response.status,
    );
  }

  // BFF wraps all success responses in { data: T } envelope (see api.ts BffResponse type)
  return (json as { data: T }).data;
}
