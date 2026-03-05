import { AuthResponseSchema } from '@/types/api';

const SUPABASE_URL = process.env.STACK_AI_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.STACK_AI_SUPABASE_ANON_KEY!;
const STACK_AI_EMAIL = process.env.STACK_AI_EMAIL!;
const STACK_AI_PASSWORD = process.env.STACK_AI_PASSWORD!;
const STACK_AI_BASE_URL = process.env.STACK_AI_BASE_URL!;

/** Safety margin: refresh 60s before actual expiry */
const EXPIRY_BUFFER_MS = 60_000;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function acquireToken(): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email: STACK_AI_EMAIL,
      password: STACK_AI_PASSWORD,
      gotrue_meta_security: {},
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Auth failed (${response.status}): ${text}`);
  }

  const json: unknown = await response.json();
  const parsed = AuthResponseSchema.parse(json);

  cachedToken = parsed.access_token;
  tokenExpiresAt = Date.now() + parsed.expires_in * 1000 - EXPIRY_BUFFER_MS;

  return parsed.access_token;
}

/** Get a valid access token, re-authenticating only when expired. */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }
  return acquireToken();
}

/** Get Authorization + Content-Type headers for Stack AI API calls. */
export async function getStackAIHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/** Build full Stack AI API URL for a given path. */
export function stackUrl(path: string): string {
  return `${STACK_AI_BASE_URL}${path}`;
}

/**
 * Shared error handler for API routes.
 * Extracts a user-friendly message and returns a consistent BFF error shape.
 */
export function toBffError(error: unknown): {
  body: { error: string; status: number };
  status: number;
} {
  if (error instanceof Error) {
    const status =
      'status' in error && typeof (error as Record<string, unknown>).status === 'number'
        ? ((error as Record<string, unknown>).status as number)
        : 500;
    return { body: { error: error.message, status }, status };
  }
  return { body: { error: 'Internal server error', status: 500 }, status: 500 };
}
