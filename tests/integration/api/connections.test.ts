/**
 * Integration tests: Connections + Connection Resources endpoints.
 *
 * ISS-2: Documented base URL (https://api.stack-ai.com) does not work.
 *        Actual URL: https://api.stackai.com (no hyphen).
 *
 * ISS-3: Documented endpoints have NO /v1/ prefix — all return 404.
 *        Actual endpoints require /v1/ prefix.
 *        Exception: /organizations/me/current works without /v1/.
 *
 * ISS-4: Documented response shape doesn't match reality:
 *        - connection_provider → provider_id
 *        - connections endpoint returns { status_code, data: [...] } not bare array
 *        - resources endpoint returns { data: [...] } without cursor fields on some responses
 *
 * Each "DOCS BUG" block asserts the documented behaviour FAILS.
 * Each "FIX" block asserts the corrected behaviour PASSES.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ACTUAL_BASE_URL,
  DOCS_BASE_URL,
  FAKE_UUID,
  getAuthHeaders,
  getConnectionId,
} from './_helpers';

// ─── shared state ────────────────────────────────────────────────────────────
let authHeaders: { Authorization: string };
let connectionId: string;

beforeAll(async () => {
  authHeaders = await getAuthHeaders();
  connectionId = await getConnectionId();
});

// ─── ISS-2: Wrong base URL ────────────────────────────────────────────────────

describe('ISS-2 [DOCS BUG] wrong base URL https://api.stack-ai.com', () => {
  it('GET /connections on documented domain returns non-200', async () => {
    const res = await fetch(`${DOCS_BASE_URL}/connections?connection_provider=gdrive&limit=1`, {
      headers: authHeaders,
    });
    // Documented URL returns a generic page or 404 — not a valid API response
    expect(res.ok).toBe(false);
  });

  it('GET /organizations/me/current on documented domain — works on both domains (not part of ISS-2)', async () => {
    const res = await fetch(`${DOCS_BASE_URL}/organizations/me/current`, {
      headers: authHeaders,
    });
    // DISCOVERY: /organizations/me/current returns 200 on BOTH api.stack-ai.com and api.stackai.com.
    // The ISS-2 domain bug only affects /v1/* endpoints — this endpoint has no /v1/ prefix
    // and resolves correctly on both domains.
    expect(res.ok).toBe(true);
  });
});

describe('ISS-2 [FIX] correct base URL https://api.stackai.com', () => {
  it('GET /organizations/me/current on actual domain returns 200 with org_id', async () => {
    const res = await fetch(`${ACTUAL_BASE_URL}/organizations/me/current`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(typeof json['org_id']).toBe('string');
    expect((json['org_id'] as string).length).toBeGreaterThan(0);
  });
});

// ─── ISS-3: Missing /v1/ prefix ──────────────────────────────────────────────

describe('ISS-3 [DOCS BUG] /connections without /v1/ prefix returns 404', () => {
  it('GET /connections (no prefix) returns 404', async () => {
    const res = await fetch(`${ACTUAL_BASE_URL}/connections?connection_provider=gdrive&limit=1`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(404);
  });

  it('GET /connections/{id}/resources/children (no prefix) returns 404', async () => {
    const res = await fetch(`${ACTUAL_BASE_URL}/connections/${connectionId}/resources/children`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(404);
  });
});

describe('ISS-3 [FIX] /v1/connections returns 200', () => {
  it('GET /v1/connections returns 200', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections?connection_provider=gdrive&limit=1`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(200);
  });

  it('ISS-3 [EXCEPTION] GET /organizations/me/current works WITHOUT /v1/ prefix', async () => {
    // This is the one endpoint that does NOT require /v1/ — intentional exception
    const res = await fetch(`${ACTUAL_BASE_URL}/organizations/me/current`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
  });

  it('ISS-3 [EXCEPTION] GET /v1/organizations/me/current with prefix returns non-200', async () => {
    // Confirms /v1/ prefix breaks the orgs endpoint
    const res = await fetch(`${ACTUAL_BASE_URL}/v1/organizations/me/current`, {
      headers: authHeaders,
    });
    expect(res.ok).toBe(false);
  });
});

// ─── ISS-4: Response shape mismatch ──────────────────────────────────────────

describe('ISS-4 [DOCS BUG] connections response shape', () => {
  it('response is NOT a bare array (docs show array, reality wraps in { status_code, data })', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections?connection_provider=gdrive&limit=1`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    // Docs show: connection.connection_provider — but this field does not exist
    expect(Array.isArray(json)).toBe(false);
  });

  it('connection object has provider_id, not connection_provider (ISS-4 field rename)', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections?connection_provider=gdrive&limit=1`,
      { headers: authHeaders },
    );
    const json = (await res.json()) as { data: Array<Record<string, unknown>> };
    const conn = json.data[0];

    // Documented field — absent in reality
    expect(conn['connection_provider']).toBeUndefined();
    // Actual field
    expect(typeof conn['provider_id']).toBe('string');
  });
});

describe('ISS-4 [FIX] connections response actual shape', () => {
  it('GET /v1/connections returns { status_code, data: [...] }', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections?connection_provider=gdrive&limit=1`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;

    expect(typeof json['status_code']).toBe('number');
    expect(Array.isArray(json['data'])).toBe(true);

    const conn = (json['data'] as Array<Record<string, unknown>>)[0];
    expect(typeof conn['connection_id']).toBe('string');
    expect(typeof conn['provider_id']).toBe('string');
  });

  it('GET /v1/connections/{id}/resources/children returns { data: [...] }', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections/${connectionId}/resources/children`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;

    expect(Array.isArray(json['data'])).toBe(true);

    // Each resource must have the documented fields
    const resources = json['data'] as Array<Record<string, unknown>>;
    if (resources.length > 0) {
      const first = resources[0];
      expect(typeof first['resource_id']).toBe('string');
      expect(['directory', 'file']).toContain(first['inode_type']);
      expect(typeof (first['inode_path'] as Record<string, unknown>)['path']).toBe('string');
    }
  });

  it('resources/children with ?resource_id= returns children of that folder', async () => {
    // Get root first, find a directory
    const rootRes = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections/${connectionId}/resources/children`,
      { headers: authHeaders },
    );
    const root = (await rootRes.json()) as {
      data: Array<{ resource_id: string; inode_type: string }>;
    };
    const folder = root.data.find((r) => r.inode_type === 'directory');

    if (!folder) {
      console.warn('No directory found in root — skipping nested folder test');
      return;
    }

    const childRes = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections/${connectionId}/resources/children?resource_id=${folder.resource_id}`,
      { headers: authHeaders },
    );
    expect(childRes.status).toBe(200);
    const childJson = (await childRes.json()) as Record<string, unknown>;
    expect(Array.isArray(childJson['data'])).toBe(true);
  });
});

// ─── Security: UUID validation ────────────────────────────────────────────────

describe('Security: invalid connection ID in path', () => {
  it('non-UUID connectionId returns 400 or 404 (not 500)', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections/../../etc/passwd/resources/children`,
      { headers: authHeaders },
    );
    // API must reject path traversal attempts — not 500
    expect([400, 401, 403, 404, 422]).toContain(res.status);
  });

  it('fake but valid-format UUID returns 404', async () => {
    const res = await fetch(`${ACTUAL_BASE_URL}/v1/connections/${FAKE_UUID}/resources/children`, {
      headers: authHeaders,
    });
    expect([404, 422]).toContain(res.status);
  });
});
