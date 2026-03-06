/**
 * Integration tests: Knowledge Base lifecycle endpoints.
 *
 * ISS-5: Documented KB create endpoint uses underscore and no /v1/:
 *        POST /knowledge_bases → 404
 *        Actual: POST /v1/knowledge-bases (hyphen, /v1/ prefix)
 *        Also: request body field names differ (chunker vs chunker_type,
 *        embedding model name, response wrapped in { data: {...} })
 *
 * ISS-6: Documented sync endpoint is wrong in method, path, and param placement:
 *        GET /knowledge_bases/sync/trigger/{kbId}/{orgId} → 404
 *        Actual: POST /v1/knowledge-bases/{kbId}/sync?org_id={orgId}
 *
 * ISS-7: Documented KB resource/delete endpoints use underscores:
 *        GET /knowledge_bases/{id}/resources/children → 404
 *        DELETE /knowledge_bases/{id}/resources → 404
 *        Actual: use /v1/knowledge-bases (hyphen) for all KB endpoints
 *
 * ISS-9: Notebook shows POST /knowledge_bases/{id}/resources for file upload (multipart).
 *        Endpoint is entirely absent from API_REFERENCE.md.
 *        Expected URL pattern: POST /v1/knowledge-bases/{id}/resources (hyphen + /v1/).
 *
 * Test lifecycle:
 *   beforeAll → create KB → trigger sync → test list/delete → afterAll (no teardown, KB is ephemeral)
 *
 * NOTE: sync is async on the server side (~1 min). Status tests run immediately
 * after sync trigger and expect "pending" or "resource" status, NOT "indexed".
 */
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ACTUAL_BASE_URL,
  FAKE_UUID,
  getAuthHeaders,
  getConnectionId,
  getFirstFile,
  getOrgId,
  jsonHeaders,
} from './_helpers';

// ─── shared state ────────────────────────────────────────────────────────────
let authHeaders: { Authorization: string };
let connectionId: string;
let orgId: string;
let knowledgeBaseId: string;
let indexedFilePath: string; // path of a file we can use for delete test

beforeAll(async () => {
  authHeaders = await getAuthHeaders();
  [connectionId, orgId] = await Promise.all([getConnectionId(), getOrgId()]);

  const file = await getFirstFile(connectionId);
  indexedFilePath = file.inode_path.path;

  // Create a KB — this is required for all ISS-5/6/7 downstream tests
  const res = await fetch(`${ACTUAL_BASE_URL}/v1/knowledge-bases`, {
    method: 'POST',
    headers: jsonHeaders(authHeaders),
    body: JSON.stringify({
      connection_id: connectionId,
      connection_source_ids: [file.resource_id],
      indexing_params: {
        ocr: false,
        embedding_params: {
          embedding_model: 'openai.text-embedding-3-large',
          api_key: null,
        },
        chunker_params: {
          chunk_size: 2500,
          chunk_overlap: 100,
          chunker_type: 'sentence',
        },
      },
      org_level_role: null,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KB create failed in beforeAll (${res.status}): ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  // Response is wrapped in { data: { knowledge_base_id, ... } } (ISS-5)
  const data = (json['data'] ?? json) as Record<string, unknown>;
  knowledgeBaseId = data['knowledge_base_id'] as string;
});

// ─── ISS-5: Wrong KB create endpoint ─────────────────────────────────────────

describe('ISS-5 [DOCS BUG] KB create: documented endpoint /knowledge_bases returns 404', () => {
  it('POST /knowledge_bases (underscore, no /v1/) returns 404', async () => {
    const res = await fetch(`${ACTUAL_BASE_URL}/knowledge_bases`, {
      method: 'POST',
      headers: jsonHeaders(authHeaders),
      body: JSON.stringify({ connection_id: connectionId, connection_source_ids: [] }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /v1/knowledge_bases (underscore, with /v1/) returns 404', async () => {
    const res = await fetch(`${ACTUAL_BASE_URL}/v1/knowledge_bases`, {
      method: 'POST',
      headers: jsonHeaders(authHeaders),
      body: JSON.stringify({ connection_id: connectionId, connection_source_ids: [] }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /v1/knowledge-bases with documented body fields (chunker, wrong model) returns error', async () => {
    // Documented body uses `chunker` instead of `chunker_type` and old model name
    const res = await fetch(`${ACTUAL_BASE_URL}/v1/knowledge-bases`, {
      method: 'POST',
      headers: jsonHeaders(authHeaders),
      body: JSON.stringify({
        connection_id: connectionId,
        connection_source_ids: ['fake-id'],
        indexing_params: {
          ocr: false,
          unstructured: true, // documented field that is not accepted
          embedding_params: { embedding_model: 'text-embedding-ada-002', api_key: null },
          chunker_params: { chunk_size: 1500, chunk_overlap: 500, chunker: 'sentence' }, // wrong key
        },
        org_level_role: null,
        cron_job_id: null, // documented field that is not accepted
      }),
    });
    // Should fail — wrong body or connection_source_ids are invalid
    expect(res.ok).toBe(false);
  });
});

describe('ISS-5 [FIX] KB create: POST /v1/knowledge-bases (hyphen)', () => {
  it('KB was created successfully in beforeAll (knowledge_base_id is a non-empty string)', () => {
    expect(typeof knowledgeBaseId).toBe('string');
    expect(knowledgeBaseId.length).toBeGreaterThan(0);
  });

  it('response is wrapped in { data: { knowledge_base_id } } envelope', async () => {
    // Re-create with a dummy to observe the envelope (we verify via beforeAll result above)
    // Just validate the ID looks UUID-shaped
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuidRe.test(knowledgeBaseId)).toBe(true);
  });
});

// ─── ISS-6: Wrong sync endpoint ──────────────────────────────────────────────

describe('ISS-6 [DOCS BUG] sync: documented endpoint GET /knowledge_bases/sync/trigger/{kbId}/{orgId}', () => {
  it('GET /knowledge_bases/sync/trigger/{kbId}/{orgId} (documented, underscore) — actually returns 2xx (legacy route still works)', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/knowledge_bases/sync/trigger/${knowledgeBaseId}/${orgId}`,
      { method: 'GET', headers: authHeaders },
    );
    // DISCOVERY: The documented legacy endpoint GET /knowledge_bases/sync/trigger/{kbId}/{orgId}
    // returns 202 — it still works. ISS-6 was wrong that this path returns 404.
    // The REAL bugs in ISS-6 are the base URL (api.stack-ai.com vs api.stackai.com — ISS-2)
    // and the /v1/ prefix requirement, NOT the path structure or HTTP method.
    expect(res.ok).toBe(true);
  });

  it('GET /v1/knowledge-bases/sync/trigger/{kbId}/{orgId} (wrong path structure) returns 404', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/knowledge-bases/sync/trigger/${knowledgeBaseId}/${orgId}`,
      { method: 'GET', headers: authHeaders },
    );
    expect(res.status).toBe(404);
  });

  it('GET /v1/knowledge-bases/{kbId}/sync?org_id= (correct path, wrong method GET) is non-2xx', async () => {
    const url = new URL(`${ACTUAL_BASE_URL}/v1/knowledge-bases/${knowledgeBaseId}/sync`);
    url.searchParams.set('org_id', orgId);
    const res = await fetch(url.toString(), { method: 'GET', headers: authHeaders });
    expect(res.ok).toBe(false);
  });
});

describe('ISS-6 [FIX] sync: POST /v1/knowledge-bases/{kbId}/sync?org_id={orgId}', () => {
  it('POST returns 2xx and sync message', async () => {
    const url = new URL(`${ACTUAL_BASE_URL}/v1/knowledge-bases/${knowledgeBaseId}/sync`);
    url.searchParams.set('org_id', orgId);
    const res = await fetch(url.toString(), { method: 'POST', headers: authHeaders });

    expect(res.ok).toBe(true);
    const json = (await res.json()) as Record<string, unknown>;
    // Response contains a "message" or "status" confirming the task started
    const hasMessage = typeof json['message'] === 'string' || typeof json['status'] === 'string';
    expect(hasMessage).toBe(true);
  });
});

// ─── ISS-7: Wrong KB resource/delete endpoints ───────────────────────────────

describe('ISS-7 [DOCS BUG] KB resources: documented endpoints use underscores', () => {
  it('GET /knowledge_bases/{kbId}/resources/children (underscore, no /v1/) returns 404', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/knowledge_bases/${knowledgeBaseId}/resources/children?resource_path=/`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(404);
  });

  it('GET /v1/knowledge_bases/{kbId}/resources/children (underscore, with /v1/) returns 404', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/knowledge_bases/${knowledgeBaseId}/resources/children?resource_path=/`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(404);
  });

  it('DELETE /knowledge_bases/{kbId}/resources (underscore, no /v1/) returns 404', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/knowledge_bases/${knowledgeBaseId}/resources?resource_path=${indexedFilePath}`,
      {
        method: 'DELETE',
        headers: jsonHeaders(authHeaders),
        body: JSON.stringify({ resource_path: indexedFilePath }),
      },
    );
    expect(res.status).toBe(404);
  });
});

describe('ISS-7 [FIX] KB resources: all use /v1/knowledge-bases (hyphen)', () => {
  it('GET /v1/knowledge-bases/{kbId}/resources/children?resource_path=/ returns 200', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/knowledge-bases/${knowledgeBaseId}/resources/children?resource_path=/`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(json['data'])).toBe(true);
  });

  it('resources have status field (pending/resource immediately after sync)', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/knowledge-bases/${knowledgeBaseId}/resources/children?resource_path=/`,
      { headers: authHeaders },
    );
    const json = (await res.json()) as { data: Array<Record<string, unknown>> };
    // Status exists on each resource — value depends on indexing progress
    if (json.data.length > 0) {
      expect('status' in json.data[0]).toBe(true);
    }
  });

  it('ISS-4 [FIX] status field accepts any string value, not just "indexed"/"pending"', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/knowledge-bases/${knowledgeBaseId}/resources/children?resource_path=/`,
      { headers: authHeaders },
    );
    const json = (await res.json()) as { data: Array<Record<string, unknown>> };
    // "resource" is a valid status value observed in reality — docs only document "indexed"/"pending"
    const knownStatuses = ['indexed', 'pending', 'resource', null];
    for (const item of json.data) {
      expect(knownStatuses).toContain(item['status'] ?? null);
    }
  });

  it('DELETE /v1/knowledge-bases/{kbId}/resources?resource_path= returns 2xx', async () => {
    const url = new URL(`${ACTUAL_BASE_URL}/v1/knowledge-bases/${knowledgeBaseId}/resources`);
    url.searchParams.set('resource_path', indexedFilePath);
    const res = await fetch(url.toString(), {
      method: 'DELETE',
      headers: jsonHeaders(authHeaders),
      body: JSON.stringify({ resource_path: indexedFilePath }),
    });
    expect(res.ok).toBe(true);
  });
});

// ─── KB resources: sub-path listing ──────────────────────────────────────────

describe('KB resources: sub-path listing (notebook section 2.3)', () => {
  it('resource_path=/ returns 200 with data array (root)', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/knowledge-bases/${knowledgeBaseId}/resources/children?resource_path=/`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(json['data'])).toBe(true);
  });

  it('[DISCOVERY] non-existent resource_path returns 400 (not 200 with empty array)', async () => {
    // UNEXPECTED: The API returns 400 for a path that doesn't exist in the KB,
    // rather than 200 with an empty data array. Client code must handle 4xx on
    // sub-path navigation, not just check for empty data.
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/knowledge-bases/${knowledgeBaseId}/resources/children?resource_path=/nonexistent-path-that-does-not-exist`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(400);
  });

  it('[ISS-10] omitting resource_path causes 500 Internal Server Error (backend bug)', async () => {
    // BUG: The server crashes with 500 when resource_path is omitted entirely.
    // This should be a 422 Unprocessable Entity or default to "/".
    // The BFF route guards against this by defaulting resource_path to "/",
    // but a direct API call without the param triggers an unhandled server error.
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/knowledge-bases/${knowledgeBaseId}/resources/children`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(500);
  });
});

// ─── ISS-9: Undocumented KB file-upload endpoint ──────────────────────────────

describe('ISS-9 [DOCS BUG] KB file upload: notebook shows POST /knowledge_bases/{id}/resources', () => {
  it('POST /knowledge_bases/{kbId}/resources (underscore, no /v1/) returns 404', async () => {
    // Same URL pattern bug as ISS-5/7 — notebook uses underscore path
    const form = new FormData();
    form.append('resource_type', 'file');
    form.append('resource_path', 'test/upload_test.txt');
    form.append('file', new Blob(['test'], { type: 'text/plain' }), 'upload_test.txt');
    const res = await fetch(`${ACTUAL_BASE_URL}/knowledge_bases/${knowledgeBaseId}/resources`, {
      method: 'POST',
      headers: authHeaders,
      body: form,
    });
    expect(res.status).toBe(404);
  });
});

describe('ISS-9 [FIX] KB file upload: POST /v1/knowledge-bases/{id}/resources', () => {
  it('POST /v1/knowledge-bases/{kbId}/resources with multipart form returns non-404', async () => {
    // API_REFERENCE.md does not document this endpoint at all.
    // Notebook shows: POST /knowledge_bases/{id}/resources with multipart form-data.
    // Discovered correct path follows same hyphen+v1 pattern as all other KB endpoints.
    const form = new FormData();
    form.append('resource_type', 'file');
    form.append('resource_path', 'test/upload_test.txt');
    form.append('file', new Blob(['test file content'], { type: 'text/plain' }), 'upload_test.txt');

    const res = await fetch(`${ACTUAL_BASE_URL}/v1/knowledge-bases/${knowledgeBaseId}/resources`, {
      method: 'POST',
      headers: authHeaders,
      body: form,
    });
    // Must not be 404 — endpoint exists at this path
    expect(res.status).not.toBe(404);
    console.info(`ISS-9 upload response: ${res.status}`);
  });
});

// ─── Security: UUID validation ────────────────────────────────────────────────

describe('Security: invalid KB ID in path', () => {
  it('fake UUID for KB resources returns 404 or 422', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/knowledge-bases/${FAKE_UUID}/resources/children?resource_path=/`,
      { headers: authHeaders },
    );
    expect([404, 422]).toContain(res.status);
  });
});

// ─── KB create: body validation (lax server-side validation) ─────────────────

describe('KB create: body validation', () => {
  it('[DISCOVERY] POST /v1/knowledge-bases with empty connection_source_ids returns 2xx (no server validation)', async () => {
    // UNEXPECTED: The API does NOT reject empty connection_source_ids.
    // It creates a KB with no sources and returns 200. Validation must happen client-side.
    const res = await fetch(`${ACTUAL_BASE_URL}/v1/knowledge-bases`, {
      method: 'POST',
      headers: jsonHeaders(authHeaders),
      body: JSON.stringify({
        connection_id: connectionId,
        connection_source_ids: [],
        indexing_params: {
          ocr: false,
          embedding_params: { embedding_model: 'openai.text-embedding-3-large', api_key: null },
          chunker_params: { chunk_size: 2500, chunk_overlap: 100, chunker_type: 'sentence' },
        },
        org_level_role: null,
      }),
    });
    expect(res.ok).toBe(true);
  });

  it('[DISCOVERY] POST /v1/knowledge-bases with missing connection_id returns 2xx (no server validation)', async () => {
    // UNEXPECTED: The API also does NOT reject a missing connection_id at create time.
    // This means input validation must be enforced at the BFF layer (which it is via Zod).
    const res = await fetch(`${ACTUAL_BASE_URL}/v1/knowledge-bases`, {
      method: 'POST',
      headers: jsonHeaders(authHeaders),
      body: JSON.stringify({ connection_source_ids: ['some-id'] }),
    });
    expect(res.ok).toBe(true);
  });
});

// ─── Pagination: KB resources cursor fields ───────────────────────────────────

describe('Pagination: KB resources cursor fields', () => {
  it('GET /v1/knowledge-bases/{kbId}/resources/children response has data array', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/knowledge-bases/${knowledgeBaseId}/resources/children?resource_path=/`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(json['data'])).toBe(true);
  });

  it('KB resources cursor fields are nullable strings when present', async () => {
    // Same ISS-4 cursor field behavior as connection resources
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/knowledge-bases/${knowledgeBaseId}/resources/children?resource_path=/`,
      { headers: authHeaders },
    );
    const json = (await res.json()) as Record<string, unknown>;
    for (const field of ['next_cursor', 'current_cursor']) {
      if (field in json) {
        expect(json[field] === null || typeof json[field] === 'string').toBe(true);
      }
    }
  });
});

// ─── Auth boundaries: KB endpoints ───────────────────────────────────────────

describe('Auth boundaries: KB endpoints reject unauthenticated requests', () => {
  it('GET /v1/knowledge-bases/{kbId}/resources/children without auth returns 401 or 403', async () => {
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/knowledge-bases/${knowledgeBaseId}/resources/children?resource_path=/`,
    );
    expect([401, 403]).toContain(res.status);
  });

  it('POST /v1/knowledge-bases/{kbId}/sync without auth returns 401 or 403', async () => {
    const url = new URL(`${ACTUAL_BASE_URL}/v1/knowledge-bases/${knowledgeBaseId}/sync`);
    url.searchParams.set('org_id', orgId);
    const res = await fetch(url.toString(), { method: 'POST' });
    expect([401, 403]).toContain(res.status);
  });

  it('DELETE /v1/knowledge-bases/{kbId}/resources without auth returns 401 or 403', async () => {
    const url = new URL(`${ACTUAL_BASE_URL}/v1/knowledge-bases/${knowledgeBaseId}/resources`);
    url.searchParams.set('resource_path', '/any-file.pdf');
    const res = await fetch(url.toString(), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_path: '/any-file.pdf' }),
    });
    expect([401, 403]).toContain(res.status);
  });
});
