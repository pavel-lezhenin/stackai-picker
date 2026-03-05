/**
 * Shared auth helpers and base URL constants for Stack AI integration tests.
 *
 * All configuration is read from TEST_* env vars (set in .env.local).
 * Two base URLs are intentionally defined:
 *   DOCS_BASE_URL   — the URL written in the assignment notebook (wrong, ISS-2)
 *   ACTUAL_BASE_URL — the real production URL discovered via Network tab
 *
 * Required env vars (see .env.example for reference):
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD,
 *   TEST_API_BASE_URL, TEST_API_BASE_URL_DOCS
 */

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key} — set it in .env.local`);
  return val;
}

const SUPABASE_URL = requireEnv('TEST_SUPABASE_URL');
const SUPABASE_ANON_KEY = requireEnv('TEST_SUPABASE_ANON_KEY');

/**
 * The URL from the assignment notebook — known to be WRONG (ISS-2).
 * Set TEST_API_BASE_URL_DOCS in .env.local (see .env.example).
 */
export const DOCS_BASE_URL = requireEnv('TEST_API_BASE_URL_DOCS');

/**
 * Correct production base URL (no hyphen between "stack" and "ai").
 * Discovered via browser Network tab, fixed in ISS-2.
 */
export const ACTUAL_BASE_URL = requireEnv('TEST_API_BASE_URL');

/** A syntactically-valid UUID that does not exist in the API — for 404 path tests. */
export const FAKE_UUID = '00000000-0000-0000-0000-000000000001';

/** Merge auth headers with Content-Type for JSON POST/DELETE requests. */
export function jsonHeaders(auth: { Authorization: string }): Record<string, string> {
  return { ...auth, 'Content-Type': 'application/json' };
}

// ─── Auth caching (one token per test process) ────────────────────────────────

let _cachedToken: string | null = null;

/** Authenticate once per test process and cache the token in memory. */
export async function getAuthHeaders(): Promise<{ Authorization: string }> {
  if (_cachedToken) return { Authorization: `Bearer ${_cachedToken}` };

  const email = requireEnv('TEST_EMAIL');
  const password = requireEnv('TEST_PASSWORD');

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password, gotrue_meta_security: {} }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as { access_token: string };
  _cachedToken = json.access_token;
  return { Authorization: `Bearer ${_cachedToken}` };
}

/** Fetch org_id for the authenticated user. */
export async function getOrgId(): Promise<string> {
  const headers = await getAuthHeaders();
  // /organizations/me/current is the ONE endpoint that works WITHOUT /v1/ prefix (ISS-3 exception)
  const res = await fetch(`${ACTUAL_BASE_URL}/organizations/me/current`, { headers });
  if (!res.ok) throw new Error(`Failed to get org_id (${res.status})`);
  const json = (await res.json()) as { org_id: string };
  return json.org_id;
}

/** Fetch first gdrive connection_id for the authenticated user. */
export async function getConnectionId(): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${ACTUAL_BASE_URL}/v1/connections?connection_provider=gdrive&limit=1`, {
    headers,
  });
  if (!res.ok) throw new Error(`Failed to get connection (${res.status})`);
  const json = (await res.json()) as { data: Array<{ connection_id: string }> };
  if (!json.data?.length) throw new Error('No gdrive connection found for test account');
  return json.data[0].connection_id;
}

/** Fetch root resources for a connection and return the first file found. */
export async function getFirstFile(
  connectionId: string,
): Promise<{ resource_id: string; inode_path: { path: string } }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${ACTUAL_BASE_URL}/v1/connections/${connectionId}/resources/children`, {
    headers,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to list resources (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    data: Array<{ resource_id: string; inode_type: string; inode_path: { path: string } }>;
  };
  const file = json.data.find((r) => r.inode_type === 'file') ?? json.data[0];
  if (!file) throw new Error('No resources found in connection root');
  return file;
}
