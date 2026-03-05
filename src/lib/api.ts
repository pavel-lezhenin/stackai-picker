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
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  const json: unknown = await response.json();

  if (!response.ok) {
    const errorBody = json as { error?: string };
    throw new ApiError(
      errorBody?.error ?? `Request failed with status ${response.status}`,
      response.status,
    );
  }

  return (json as { data: T }).data;
}
