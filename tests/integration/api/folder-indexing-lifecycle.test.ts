/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ISS-11 VERIFIED API FACTS — DO NOT MODIFY ASSERTIONS
 *
 * These tests encode empirically verified behaviors of the Stack AI KB API.
 * Confirmed against the live API on 2026-03-07. They serve as the foundation
 * for the client-side indexing resolution algorithm (ISS-11 Section 8).
 *
 * Each @verified test contains hard assertions (`expect`) based on observed
 * behavior across two independent test runs with different folders/files.
 *
 * ⛔ DO NOT EDIT assertions in @verified tests — they are proven ground truth.
 *    If a test fails, the API behavior has changed — investigate, don't "fix".
 *
 * Performance: polls sub-paths (not root) — files index in ~30-60s.
 *   Root poll is intentionally avoided because directories never get 'indexed'.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ACTUAL_BASE_URL,
  getAuthHeaders,
  getConnectionId,
  getOrgId,
  jsonHeaders,
} from './_helpers';

// ─── Types ───────────────────────────────────────────────────────────────────

type RawResource = {
  resource_id: string;
  inode_type: 'directory' | 'file';
  inode_path: { path: string };
  status?: string | null;
  created_at?: string | null;
  modified_at?: string | null;
};

type PaginatedResponse = {
  data: RawResource[];
  next_cursor: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractName(path: string): string {
  const segments = path.replace(/\/$/, '').split('/');
  return segments[segments.length - 1] || path;
}

/** Fetch ALL children of a connection folder (paginated). */
async function fetchConnectionChildren(
  connectionId: string,
  folderId: string | undefined,
  headers: { Authorization: string },
): Promise<RawResource[]> {
  const all: RawResource[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams();
    if (folderId) params.set('resource_id', folderId);
    if (cursor) params.set('cursor', cursor);
    const qs = params.size ? `?${params}` : '';
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/connections/${connectionId}/resources/children${qs}`,
      { headers },
    );
    if (!res.ok) throw new Error(`Connection children failed (${res.status})`);
    const json = (await res.json()) as PaginatedResponse;
    all.push(...json.data);
    cursor = json.next_cursor ?? null;
  } while (cursor);

  return all;
}

/** Fetch KB resources at a given path (paginated). Returns empty array on 400. */
async function fetchKBResources(
  kbId: string,
  resourcePath: string,
  headers: { Authorization: string },
): Promise<RawResource[]> {
  const all: RawResource[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({ resource_path: resourcePath });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(
      `${ACTUAL_BASE_URL}/v1/knowledge-bases/${kbId}/resources/children?${params}`,
      { headers },
    );
    if (res.status === 400) return [];
    if (!res.ok) throw new Error(`KB resources failed (${res.status})`);
    const json = (await res.json()) as PaginatedResponse;
    all.push(...json.data);
    cursor = json.next_cursor ?? null;
  } while (cursor);

  return all;
}

/**
 * Poll KB sub-path until all FILES are 'indexed' or timeout.
 * Only checks file entries — directories are excluded because they never
 * reach 'indexed' (this is a verified fact, see FACT-1).
 */
async function pollSubPathUntilFilesIndexed(
  kbId: string,
  resourcePath: string,
  headers: { Authorization: string },
  timeoutMs: number = 60_000,
  intervalMs: number = 2_000,
): Promise<{ resources: RawResource[]; timedOut: boolean }> {
  const start = Date.now();
  let resources: RawResource[] = [];

  while (Date.now() - start < timeoutMs) {
    resources = await fetchKBResources(kbId, resourcePath, headers);
    const files = resources.filter((r) => r.inode_type === 'file');

    if (files.length > 0 && files.every((r) => r.status === 'indexed')) {
      return { resources, timedOut: false };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  resources = await fetchKBResources(kbId, resourcePath, headers);
  return { resources, timedOut: true };
}

/** Create a KB with given file IDs, trigger sync, return kbId. */
async function createAndSyncKB(
  connectionId: string,
  orgId: string,
  fileIds: string[],
  headers: { Authorization: string },
): Promise<string> {
  const createRes = await fetch(`${ACTUAL_BASE_URL}/v1/knowledge-bases`, {
    method: 'POST',
    headers: jsonHeaders(headers),
    body: JSON.stringify({
      connection_id: connectionId,
      connection_source_ids: fileIds,
      indexing_params: {
        ocr: false,
        embedding_params: { embedding_model: 'openai.text-embedding-3-large', api_key: null },
        chunker_params: { chunk_size: 2500, chunk_overlap: 100, chunker_type: 'sentence' },
      },
      org_level_role: null,
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`KB create failed (${createRes.status}): ${text.slice(0, 500)}`);
  }

  const createJson = (await createRes.json()) as Record<string, unknown>;
  const data = (createJson['data'] ?? createJson) as Record<string, unknown>;
  const kbId = data['knowledge_base_id'] as string;

  const syncUrl = new URL(`${ACTUAL_BASE_URL}/v1/knowledge-bases/${kbId}/sync`);
  syncUrl.searchParams.set('org_id', orgId);
  await fetch(syncUrl.toString(), { method: 'POST', headers });

  return kbId;
}

/** Delete a KB (best-effort cleanup). */
async function deleteKB(kbId: string, headers: { Authorization: string }): Promise<void> {
  try {
    await fetch(`${ACTUAL_BASE_URL}/v1/knowledge-bases/${kbId}`, {
      method: 'DELETE',
      headers,
    });
  } catch {
    // best-effort
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 1: acme folder (5 PDF/CSV files, 0 subfolders)
// Verifies: FACT-1, FACT-3, FACT-4, FACT-5, FACT-6 + resolution algorithm
// ═══════════════════════════════════════════════════════════════════════════════

describe('ISS-11 VERIFIED: acme folder — directory status & sub-path polling', () => {
  let authHeaders: { Authorization: string };
  let connectionId: string;
  let kbId: string;

  let submittedFiles: RawResource[];
  let folderName: string;

  // KB state after indexing
  let kbRoot: RawResource[];
  let kbSubPath: RawResource[];

  beforeAll(async () => {
    authHeaders = await getAuthHeaders();
    let orgId: string;
    [connectionId, orgId] = await Promise.all([getConnectionId(), getOrgId()]);

    // Find "acme" folder
    const rootResources = await fetchConnectionChildren(connectionId, undefined, authHeaders);
    const folder = rootResources.find(
      (r) => r.inode_type === 'directory' && extractName(r.inode_path.path) === 'acme',
    );
    if (!folder) throw new Error('No "acme" folder in connection root');
    folderName = extractName(folder.inode_path.path);

    // List direct children (acme has no subfolders — all are files)
    const children = await fetchConnectionChildren(connectionId, folder.resource_id, authHeaders);
    submittedFiles = children.filter((r) => r.inode_type === 'file');
    if (submittedFiles.length === 0) throw new Error('acme folder has no files');

    console.log(`[acme] Submitting ${submittedFiles.length} files`);

    // Create KB + sync
    const fileIds = submittedFiles.map((r) => r.resource_id);
    kbId = await createAndSyncKB(connectionId, orgId, fileIds, authHeaders);
    console.log(`[acme] KB: ${kbId}`);

    // Poll SUB-PATH (not root!) — files index in ~30-60s
    const result = await pollSubPathUntilFilesIndexed(kbId, `/${folderName}`, authHeaders, 60_000);
    kbSubPath = result.resources;
    if (result.timedOut) {
      console.warn(`[acme] ⚠️ Sub-path poll timed out — some assertions may fail`);
    }

    // Fetch root ONCE (no polling — we know it never resolves)
    kbRoot = await fetchKBResources(kbId, '/', authHeaders);

    console.log(`[acme] Root: ${kbRoot.length} entries, Sub-path: ${kbSubPath.length} entries`);
  }, 90_000);

  afterAll(async () => {
    if (kbId) await deleteKB(kbId, authHeaders);
  });

  // ─── @verified FACT-1 ──────────────────────────────────────────────────
  // Directory entries in KB responses NEVER have status='indexed'.
  // The server returns status=undefined for all directory entries.
  // This means polling root for `every(r => r.status === 'indexed')` will
  // NEVER terminate — the fundamental bug behind ISS-11.
  // ──────────────────────────────────────────────────────────────────────
  it('@verified FACT-1: directory entries never have status=indexed', () => {
    const dirs = kbRoot.filter((r) => r.inode_type === 'directory');

    expect(dirs.length).toBeGreaterThan(0);
    for (const d of dirs) {
      expect(d.status).not.toBe('indexed');
      expect(d.status == null).toBe(true);
    }
  });

  // ─── @verified FACT-3 ──────────────────────────────────────────────────
  // KB root (`resource_path=/`) contains ONLY directory entries when files
  // live inside folders. No file entries appear at root level.
  // Files are accessible only via sub-path queries.
  // ──────────────────────────────────────────────────────────────────────
  it('@verified FACT-3: root contains only directory entries, no files', () => {
    const rootFiles = kbRoot.filter((r) => r.inode_type === 'file');
    const rootDirs = kbRoot.filter((r) => r.inode_type === 'directory');

    expect(rootFiles.length).toBe(0);
    expect(rootDirs.length).toBeGreaterThan(0);
  });

  // ─── @verified FACT-4 ──────────────────────────────────────────────────
  // resource_path=/folderName returns the folder's children.
  // Sub-path polling is the correct strategy for tracking indexing progress.
  // ──────────────────────────────────────────────────────────────────────
  it('@verified FACT-4: sub-path query returns folder children', () => {
    expect(kbSubPath.length).toBe(submittedFiles.length);

    const subPathFiles = kbSubPath.filter((r) => r.inode_type === 'file');
    expect(subPathFiles.length).toBe(submittedFiles.length);
  });

  // ─── @verified FACT-5 ──────────────────────────────────────────────────
  // All processable files (PDF, CSV) reach status='indexed' after sync.
  // The server successfully processes standard document formats.
  // ──────────────────────────────────────────────────────────────────────
  it('@verified FACT-5: all processable files reach status=indexed', () => {
    const files = kbSubPath.filter((r) => r.inode_type === 'file');

    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(f.status).toBe('indexed');
    }
  });

  // ─── @verified FACT-6 ──────────────────────────────────────────────────
  // Root directory status remains undefined/null even after ALL children
  // are indexed. The server never updates directory status to 'indexed'.
  // This is the root cause of ISS-11: polling root can never succeed.
  // ──────────────────────────────────────────────────────────────────────
  it('@verified FACT-6: root directory status stays null after all children indexed', () => {
    const subPathFiles = kbSubPath.filter((r) => r.inode_type === 'file');
    const allIndexed = subPathFiles.every((r) => r.status === 'indexed');
    expect(allIndexed).toBe(true);

    const rootDir = kbRoot.find(
      (r) => r.inode_type === 'directory' && extractName(r.inode_path.path) === folderName,
    );
    expect(rootDir).toBeDefined();
    expect(rootDir!.status).not.toBe('indexed');
    expect(rootDir!.status == null).toBe(true);
  });

  // ─── @verified: resolution algorithm produces correct results ──────────
  // When all server files are indexed and no files are missing,
  // the algorithm marks 0 pending, 0 error. Folder derives to 'indexed'.
  // ──────────────────────────────────────────────────────────────────────
  it('@verified: resolution algorithm — all-processable folder → indexed', () => {
    const submitted = new Map<string, { name: string; resolved: string }>();
    for (const f of submittedFiles) {
      submitted.set(f.resource_id, { name: extractName(f.inode_path.path), resolved: 'pending' });
    }

    const kbAll = [...kbRoot, ...kbSubPath];
    const kbIds = new Set(kbAll.map((r) => r.resource_id));
    const kbNameStatus = new Map(kbAll.map((r) => [extractName(r.inode_path.path), r.status]));

    for (const [id, file] of submitted) {
      if (kbIds.has(id) || kbNameStatus.get(file.name) === 'indexed') {
        file.resolved = 'indexed';
      }
    }

    const serverFiles = kbAll.filter((r) => r.inode_type === 'file');
    const allDone = serverFiles.length > 0 && serverFiles.every((r) => r.status === 'indexed');
    if (allDone) {
      for (const [id, file] of submitted) {
        if (file.resolved === 'pending' && !kbIds.has(id) && !kbNameStatus.has(file.name)) {
          file.resolved = 'error';
        }
      }
    }

    const values = [...submitted.values()];
    const indexed = values.filter((f) => f.resolved === 'indexed');
    const errored = values.filter((f) => f.resolved === 'error');
    const pending = values.filter((f) => f.resolved === 'pending');

    expect(indexed.length).toBe(submittedFiles.length);
    expect(errored.length).toBe(0);
    expect(pending.length).toBe(0);

    const folderStatus =
      pending.length === 0 ? (indexed.length > 0 ? 'indexed' : 'error') : 'pending';
    expect(folderStatus).toBe('indexed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 2: references folder (.DS_Store + reference_list.txt)
// Verifies: FACT-2 (unprocessable files silently absent) + resolution algorithm
// ═══════════════════════════════════════════════════════════════════════════════

describe('ISS-11 VERIFIED: references folder — unprocessable file (.DS_Store)', () => {
  let authHeaders: { Authorization: string };
  let connectionId: string;
  let kbId: string;

  let allFileChildren: RawResource[];
  let dsStoreResource: RawResource;

  let kbRoot: RawResource[];
  let kbSubPath: RawResource[];

  beforeAll(async () => {
    authHeaders = await getAuthHeaders();
    let orgId: string;
    [connectionId, orgId] = await Promise.all([getConnectionId(), getOrgId()]);

    // Find "references" folder
    const rootResources = await fetchConnectionChildren(connectionId, undefined, authHeaders);
    const folder = rootResources.find(
      (r) => r.inode_type === 'directory' && extractName(r.inode_path.path) === 'references',
    );
    if (!folder) throw new Error('No "references" folder in connection root');

    // List children
    const children = await fetchConnectionChildren(connectionId, folder.resource_id, authHeaders);
    allFileChildren = children.filter((r) => r.inode_type === 'file');
    const ds = allFileChildren.find((r) => extractName(r.inode_path.path) === '.DS_Store');
    if (!ds) throw new Error('No .DS_Store in references folder');
    dsStoreResource = ds;

    console.log(
      `[refs] ${allFileChildren.length} files: ${allFileChildren.map((r) => extractName(r.inode_path.path)).join(', ')}`,
    );

    // Create KB with ALL files including .DS_Store
    const fileIds = allFileChildren.map((r) => r.resource_id);
    kbId = await createAndSyncKB(connectionId, orgId, fileIds, authHeaders);
    console.log(`[refs] KB: ${kbId}`);

    // Poll sub-path — reference_list.txt should index, .DS_Store should be absent
    const result = await pollSubPathUntilFilesIndexed(kbId, '/references', authHeaders, 60_000);
    kbSubPath = result.resources;
    if (result.timedOut) {
      console.warn(`[refs] ⚠️ Sub-path poll timed out`);
    }

    // Fetch root once
    kbRoot = await fetchKBResources(kbId, '/', authHeaders);

    console.log(`[refs] Root: ${kbRoot.length} entries, Sub-path: ${kbSubPath.length} entries`);
  }, 90_000);

  afterAll(async () => {
    if (kbId) await deleteKB(kbId, authHeaders);
  });

  // ─── @verified FACT-2 ──────────────────────────────────────────────────
  // Unprocessable files (.DS_Store) are SILENTLY ABSENT from KB responses.
  // The server doesn't return them with status=null or status=error —
  // they simply don't appear at all. This means the client must detect
  // "missing" files to distinguish "skipped" from "still processing".
  // ──────────────────────────────────────────────────────────────────────
  it('@verified FACT-2: .DS_Store is silently absent from KB response', () => {
    const allKB = [...kbRoot, ...kbSubPath];
    const dsInKB = allKB.find((r) => extractName(r.inode_path.path) === '.DS_Store');

    expect(dsInKB).toBeUndefined();
  });

  // ─── @verified FACT-2b ─────────────────────────────────────────────────
  // reference_list.txt (processable .txt) reaches status='indexed'.
  // Unprocessable files don't prevent siblings from being processed.
  // ──────────────────────────────────────────────────────────────────────
  it('@verified FACT-2b: processable sibling (reference_list.txt) reaches indexed', () => {
    const ref = kbSubPath.find((r) => extractName(r.inode_path.path) === 'reference_list.txt');

    expect(ref).toBeDefined();
    expect(ref!.status).toBe('indexed');
  });

  // ─── @verified FACT-2c ─────────────────────────────────────────────────
  // Exactly 1 file is missing from KB — .DS_Store. The server accepts the
  // file ID at creation but silently drops it from resource listings.
  // ──────────────────────────────────────────────────────────────────────
  it('@verified FACT-2c: exactly 1 submitted file missing from KB (.DS_Store)', () => {
    const allKB = [...kbRoot, ...kbSubPath];
    const kbNames = new Set(
      allKB.filter((r) => r.inode_type === 'file').map((r) => extractName(r.inode_path.path)),
    );

    const submittedNames = allFileChildren.map((r) => extractName(r.inode_path.path));
    const missing = submittedNames.filter((n) => !kbNames.has(n));

    expect(missing.length).toBe(1);
    expect(missing[0]).toBe('.DS_Store');
  });

  // ─── @verified: resolution algorithm with unprocessable file ───────────
  // .DS_Store → error (absent from KB, detected by all-siblings-done)
  // reference_list.txt → indexed
  // Folder → 'indexed' (has at least one indexed child)
  // ──────────────────────────────────────────────────────────────────────
  it('@verified: resolution algorithm — .DS_Store → error, folder → indexed', () => {
    const submitted = new Map<string, { name: string; resolved: string }>();
    for (const f of allFileChildren) {
      submitted.set(f.resource_id, { name: extractName(f.inode_path.path), resolved: 'pending' });
    }

    const allKB = [...kbRoot, ...kbSubPath];
    const kbIds = new Set(allKB.map((r) => r.resource_id));
    const kbNameStatus = new Map(allKB.map((r) => [extractName(r.inode_path.path), r.status]));

    for (const [id, file] of submitted) {
      if (kbIds.has(id) || kbNameStatus.get(file.name) === 'indexed') {
        file.resolved = 'indexed';
      }
    }

    const serverFiles = allKB.filter((r) => r.inode_type === 'file');
    const allDone = serverFiles.length > 0 && serverFiles.every((r) => r.status === 'indexed');
    if (allDone) {
      for (const [id, file] of submitted) {
        if (file.resolved === 'pending' && !kbIds.has(id) && !kbNameStatus.has(file.name)) {
          file.resolved = 'error';
        }
      }
    }

    const dsEntry = submitted.get(dsStoreResource.resource_id);
    expect(dsEntry).toBeDefined();
    expect(dsEntry!.resolved).toBe('error');

    const refEntry = [...submitted.values()].find((f) => f.name === 'reference_list.txt');
    expect(refEntry).toBeDefined();
    expect(refEntry!.resolved).toBe('indexed');

    const values = [...submitted.values()];
    const pending = values.filter((f) => f.resolved === 'pending');
    expect(pending.length).toBe(0);

    const indexed = values.filter((f) => f.resolved === 'indexed');
    const folderStatus =
      pending.length === 0 ? (indexed.length > 0 ? 'indexed' : 'error') : 'pending';
    expect(folderStatus).toBe('indexed');
  });
});
