/**
 * Integration tests: Pagination behavior and auth boundary enforcement.
 *
 * Pagination — documents actual cursor field behavior vs the API reference.
 * The API reference declares { data, next_cursor, current_cursor } as the
 * standard response shape, but small result sets may omit cursor fields entirely.
 * Client code that crashes on missing cursor fields has a latent bug.
 *
 * Auth boundaries — every /v1/ endpoint must reject unauthenticated requests.
 * No auth header → 401. Invalid token → 401. These are not documented but are
 * security requirements and must be locked in as regression tests.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { ACTUAL_BASE_URL, getAuthHeaders, getConnectionId } from './_helpers';

// ─── shared state ────────────────────────────────────────────────────────────
let authHeaders: { Authorization: string };
let connectionId: string;

beforeAll(async () => {
  authHeaders = await getAuthHeaders();
  connectionId = await getConnectionId();
});

// ─── Pagination: cursor field behavior ───────────────────────────────────────

describe('Pagination: connection resources cursor fields', () => {
  it('response has a data array', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections/${connectionId}/resources/children`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(json['data'])).toBe(true);
  });

  it('cursor fields are nullable strings when present (may be absent for single-page results)', async () => {
    // ISS-4 extension: docs promise next_cursor/current_cursor are always present.
    // Reality: for result sets that fit in one page, the API may omit these fields entirely.
    // Client code MUST treat absent cursor fields as null — never crash on undefined.
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections/${connectionId}/resources/children`,
      { headers: authHeaders },
    );
    const json = (await res.json()) as Record<string, unknown>;

    for (const field of ['next_cursor', 'current_cursor']) {
      if (field in json) {
        // When present: must be null or a string — not a number, object, or boolean
        expect(json[field] === null || typeof json[field] === 'string').toBe(true);
      }
    }

    console.info(
      `cursor fields: ` +
        `next_cursor=${'next_cursor' in json ? String(json['next_cursor']) : 'ABSENT'}, ` +
        `current_cursor=${'current_cursor' in json ? String(json['current_cursor']) : 'ABSENT '}`,
    );
  });

  it('limit=1 on /v1/connections returns at most 1 connection', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections?connection_provider=gdrive&limit=1`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown[] };
    expect(json.data.length).toBeLessThanOrEqual(1);
  });

  it('cursor pagination: if next_cursor non-null, using it returns a valid next page', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections/${connectionId}/resources/children`,
      { headers: authHeaders },
    );
    const json = (await res.json()) as { data: unknown[]; next_cursor?: string | null };

    if (!json.next_cursor) {
      // Root folder fits in one page — cursor navigation not applicable here
      console.info('next_cursor is null — root is single-page, skipping cursor navigation');
      return;
    }

    const page2Res = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections/${connectionId}/resources/children?cursor=${encodeURIComponent(json.next_cursor)}`,
      { headers: authHeaders },
    );
    expect(page2Res.status).toBe(200);
    const page2 = (await page2Res.json()) as Record<string, unknown>;
    expect(Array.isArray(page2['data'])).toBe(true);
  });

  it('connections response has status_code field alongside data', async () => {
    // ISS-4: connections wraps in { status_code, data } — not a bare array
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections?connection_provider=gdrive&limit=1`,
      { headers: authHeaders },
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect(typeof json['status_code']).toBe('number');
    expect(Array.isArray(json['data'])).toBe(true);
  });
});

// ─── Auth boundaries: /v1/ endpoints require Authorization ───────────────────

describe('Auth boundaries: /v1/ endpoints reject unauthenticated requests', () => {
  it('GET /v1/connections — no Authorization header returns 401 or 403', async () => {
    const res = await fetch(`${ACTUAL_BASE_URL}/v1/connections?connection_provider=gdrive&limit=1`);
    expect([401, 403]).toContain(res.status);
  });

  it('GET /v1/connections/{id}/resources/children — no Authorization header returns 401 or 403', async () => {
    const res = await fetch(`${ACTUAL_BASE_URL}/v1/connections/${connectionId}/resources/children`);
    expect([401, 403]).toContain(res.status);
  });

  it('GET /organizations/me/current — no Authorization header returns 401 or 403', async () => {
    const res = await fetch(`${ACTUAL_BASE_URL}/organizations/me/current`);
    expect([401, 403]).toContain(res.status);
  });

  it('Authorization: Bearer <invalid_token> returns 401 or 403', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections?connection_provider=gdrive&limit=1`,
      { headers: { Authorization: 'Bearer not.a.valid.jwt' } },
    );
    expect([401, 403]).toContain(res.status);
  });

  it('POST /v1/knowledge-bases — no Authorization header returns 401 or 403', async () => {
    const res = await fetch(`${ACTUAL_BASE_URL}/v1/knowledge-bases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection_id: connectionId, connection_source_ids: [] }),
    });
    expect([401, 403]).toContain(res.status);
  });
});
