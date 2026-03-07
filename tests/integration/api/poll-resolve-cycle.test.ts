/**
 * ISS-11 Prototype: Poll-and-Resolve Cycle
 *
 * This is NOT a test of existing code — it IS the algorithm prototype.
 * We run the full indexing lifecycle against real API and resolve every
 * submitted file to a terminal status (indexed | error), never leaving
 * anything stuck in 'pending'.
 *
 * The algorithm:
 *   1. Submit folder → get children from connection API
 *   2. Create KB with all file IDs → sync
 *   3. Poll KB sub-path every 2s
 *   4. On each poll tick: match server response to submitted files
 *   5. Resolution signals:
 *      a) File in KB with status='indexed' → resolved as 'indexed'
 *      b) All server files indexed + file NOT in KB → resolved as 'error' (skipped)
 *      c) Timeout (60s) + file NOT in KB → resolved as 'error'
 *   6. Folder status = derived from children:
 *      - all children resolved + any indexed → 'indexed'
 *      - all children resolved + none indexed → 'error'
 *      - any child pending → 'pending'
 *
 * Verified facts this builds on (from folder-indexing-lifecycle.test.ts):
 *   FACT-1: Directories never get status='indexed' (always null)
 *   FACT-2: Unprocessable files (.DS_Store) silently absent from KB
 *   FACT-3: Root contains only directory entries, no files
 *   FACT-4: Sub-path polling returns folder children
 *   FACT-5: Processable files reach status='indexed'
 *   FACT-6: Root directory stays null after all children indexed
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
};

type PaginatedResponse = {
  data: RawResource[];
  next_cursor: string | null;
};

/** What we track for every submitted file */
type TrackedFile = {
  id: string;
  name: string;
  path: string;
  status: 'pending' | 'indexed' | 'error';
};

/** What we track for a submitted folder */
type TrackedFolder = {
  id: string;
  name: string;
  path: string;
  childFileIds: string[];
  status: 'pending' | 'indexed' | 'error';
};

/** The full state of an indexing job */
type IndexingJob = {
  kbId: string;
  folderPath: string; // sub-path to poll (e.g. '/acme')
  files: Map<string, TrackedFile>; // id → tracked file
  folder: TrackedFolder;
  resolved: boolean;
};

// ─── Pure helpers (candidates for src/lib/) ──────────────────────────────────

function extractName(path: string): string {
  const segments = path.replace(/\/$/, '').split('/');
  return segments[segments.length - 1] || path;
}

/** Fetch connection children (paginated) */
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

/** Fetch KB resources at a path (paginated). Returns empty on 400. */
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

/** Create KB + trigger sync. Returns kbId. */
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

// ═══════════════════════════════════════════════════════════════════════════════
// THE ALGORITHM — this is what we're prototyping
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Single tick of the resolution algorithm.
 * Takes the current KB response and updates tracked files in-place.
 * Returns true if all files are resolved (no more polling needed).
 *
 * Resolution rules:
 *   1. File found in KB with status='indexed' → mark as 'indexed'
 *   2. All KB files are 'indexed' + this file NOT in KB → mark as 'error' (skipped)
 *   3. Otherwise → stays 'pending' (keep polling)
 */
function resolveTick(job: IndexingJob, kbResources: RawResource[]): boolean {
  const kbFiles = kbResources.filter((r) => r.inode_type === 'file');
  const kbFileIds = new Set(kbFiles.map((r) => r.resource_id));
  const kbFileNames = new Set(kbFiles.map((r) => extractName(r.inode_path.path)));

  // Signal: all files the server knows about are indexed
  const allServerFilesDone =
    kbFiles.length > 0 && kbFiles.every((r) => r.status === 'indexed');

  for (const [, file] of job.files) {
    if (file.status !== 'pending') continue; // already resolved

    // Rule 1: server says indexed
    if (kbFileIds.has(file.id) || kbFileNames.has(file.name)) {
      const kbEntry =
        kbFiles.find((r) => r.resource_id === file.id) ??
        kbFiles.find((r) => extractName(r.inode_path.path) === file.name);
      if (kbEntry?.status === 'indexed') {
        file.status = 'indexed';
        continue;
      }
      // File exists in KB but not yet indexed — keep polling
      continue;
    }

    // Rule 2: file not in KB at all, but all known files are done → skipped
    if (allServerFilesDone) {
      file.status = 'error';
    }
  }

  // Derive folder status from children
  const values = [...job.files.values()];
  const anyPending = values.some((f) => f.status === 'pending');
  if (anyPending) {
    job.folder.status = 'pending';
  } else {
    const anyIndexed = values.some((f) => f.status === 'indexed');
    job.folder.status = anyIndexed ? 'indexed' : 'error';
  }

  job.resolved = !anyPending;
  return job.resolved;
}

/**
 * Full poll-and-resolve loop.
 * Polls KB sub-path, runs resolveTick each iteration,
 * stops when all files resolved or timeout.
 */
async function pollAndResolve(
  job: IndexingJob,
  headers: { Authorization: string },
  timeoutMs: number = 60_000,
  intervalMs: number = 2_000,
): Promise<{ timedOut: boolean; ticks: number }> {
  const start = Date.now();
  let ticks = 0;

  while (Date.now() - start < timeoutMs) {
    const kbResources = await fetchKBResources(job.kbId, job.folderPath, headers);
    ticks++;

    const done = resolveTick(job, kbResources);
    if (done) return { timedOut: false, ticks };

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  // Final tick after timeout
  const kbResources = await fetchKBResources(job.kbId, job.folderPath, headers);
  ticks++;

  // Timeout acts as fallback resolution — mark remaining pending as error
  for (const [, file] of job.files) {
    if (file.status === 'pending') {
      file.status = 'error';
    }
  }
  // Re-derive folder
  const anyIndexed = [...job.files.values()].some((f) => f.status === 'indexed');
  job.folder.status = anyIndexed ? 'indexed' : 'error';
  job.resolved = true;

  return { timedOut: true, ticks };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test: acme folder (all processable files)
// Expected: all files → indexed, folder → indexed, 0 errors
// ═══════════════════════════════════════════════════════════════════════════════

describe('Poll-Resolve: acme (all processable)', () => {
  let authHeaders: { Authorization: string };
  let connectionId: string;
  let orgId: string;
  let job: IndexingJob;
  let result: { timedOut: boolean; ticks: number };

  beforeAll(async () => {
    authHeaders = await getAuthHeaders();
    [connectionId, orgId] = await Promise.all([getConnectionId(), getOrgId()]);

    // 1. Get folder + children
    const root = await fetchConnectionChildren(connectionId, undefined, authHeaders);
    const folder = root.find(
      (r) => r.inode_type === 'directory' && extractName(r.inode_path.path) === 'acme',
    );
    if (!folder) throw new Error('acme folder not found');

    const children = await fetchConnectionChildren(connectionId, folder.resource_id, authHeaders);
    const fileChildren = children.filter((r) => r.inode_type === 'file');

    // 2. Create KB + sync
    const fileIds = fileChildren.map((r) => r.resource_id);
    const kbId = await createAndSyncKB(connectionId, orgId, fileIds, authHeaders);

    // 3. Build IndexingJob
    const files = new Map<string, TrackedFile>();
    for (const f of fileChildren) {
      files.set(f.resource_id, {
        id: f.resource_id,
        name: extractName(f.inode_path.path),
        path: f.inode_path.path,
        status: 'pending',
      });
    }

    const folderName = extractName(folder.inode_path.path);
    job = {
      kbId,
      folderPath: `/${folderName}`,
      files,
      folder: {
        id: folder.resource_id,
        name: folderName,
        path: folder.inode_path.path,
        childFileIds: fileIds,
        status: 'pending',
      },
      resolved: false,
    };

    console.log(`[acme] KB=${kbId}, ${fileIds.length} files, polling ${job.folderPath}`);

    // 4. Run the algorithm
    result = await pollAndResolve(job, authHeaders, 60_000, 2_000);

    console.log(`[acme] Done in ${result.ticks} ticks, timedOut=${result.timedOut}`);
  }, 90_000);

  afterAll(async () => {
    if (job?.kbId) {
      await fetch(`${ACTUAL_BASE_URL}/v1/knowledge-bases/${job.kbId}`, {
        method: 'DELETE',
        headers: authHeaders,
      }).catch(() => {});
    }
  });

  it('resolves without timeout', () => {
    expect(result.timedOut).toBe(false);
  });

  it('marks all files as indexed', () => {
    const statuses = [...job.files.values()].map((f) => ({
      name: f.name,
      status: f.status,
    }));
    console.log('[acme] File statuses:', statuses);

    for (const file of job.files.values()) {
      expect(file.status).toBe('indexed');
    }
  });

  it('has zero files stuck in pending', () => {
    const pending = [...job.files.values()].filter((f) => f.status === 'pending');
    expect(pending.length).toBe(0);
  });

  it('derives folder status as indexed', () => {
    expect(job.folder.status).toBe('indexed');
  });

  it('job is fully resolved', () => {
    expect(job.resolved).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test: references folder (.DS_Store = unprocessable)
// Expected: reference_list.txt → indexed, .DS_Store → error, folder → indexed
// ═══════════════════════════════════════════════════════════════════════════════

describe('Poll-Resolve: references (with .DS_Store)', () => {
  let authHeaders: { Authorization: string };
  let connectionId: string;
  let orgId: string;
  let job: IndexingJob;
  let result: { timedOut: boolean; ticks: number };

  beforeAll(async () => {
    authHeaders = await getAuthHeaders();
    [connectionId, orgId] = await Promise.all([getConnectionId(), getOrgId()]);

    const root = await fetchConnectionChildren(connectionId, undefined, authHeaders);
    const folder = root.find(
      (r) => r.inode_type === 'directory' && extractName(r.inode_path.path) === 'references',
    );
    if (!folder) throw new Error('references folder not found');

    const children = await fetchConnectionChildren(connectionId, folder.resource_id, authHeaders);
    const fileChildren = children.filter((r) => r.inode_type === 'file');

    const fileIds = fileChildren.map((r) => r.resource_id);
    const kbId = await createAndSyncKB(connectionId, orgId, fileIds, authHeaders);

    const files = new Map<string, TrackedFile>();
    for (const f of fileChildren) {
      files.set(f.resource_id, {
        id: f.resource_id,
        name: extractName(f.inode_path.path),
        path: f.inode_path.path,
        status: 'pending',
      });
    }

    const folderName = extractName(folder.inode_path.path);
    job = {
      kbId,
      folderPath: `/${folderName}`,
      files,
      folder: {
        id: folder.resource_id,
        name: folderName,
        path: folder.inode_path.path,
        childFileIds: fileIds,
        status: 'pending',
      },
      resolved: false,
    };

    console.log(`[refs] KB=${kbId}, files: ${[...files.values()].map((f) => f.name).join(', ')}`);

    result = await pollAndResolve(job, authHeaders, 60_000, 2_000);

    console.log(`[refs] Done in ${result.ticks} ticks, timedOut=${result.timedOut}`);
  }, 90_000);

  afterAll(async () => {
    if (job?.kbId) {
      await fetch(`${ACTUAL_BASE_URL}/v1/knowledge-bases/${job.kbId}`, {
        method: 'DELETE',
        headers: authHeaders,
      }).catch(() => {});
    }
  });

  it('resolves without timeout', () => {
    expect(result.timedOut).toBe(false);
  });

  it('marks reference_list.txt as indexed', () => {
    const ref = [...job.files.values()].find((f) => f.name === 'reference_list.txt');
    expect(ref).toBeDefined();
    expect(ref!.status).toBe('indexed');
  });

  it('marks .DS_Store as error (skipped by server)', () => {
    const ds = [...job.files.values()].find((f) => f.name === '.DS_Store');
    expect(ds).toBeDefined();
    expect(ds!.status).toBe('error');
  });

  it('has zero files stuck in pending', () => {
    const pending = [...job.files.values()].filter((f) => f.status === 'pending');
    expect(pending.length).toBe(0);
  });

  it('derives folder status as indexed (has at least one indexed child)', () => {
    expect(job.folder.status).toBe('indexed');
  });

  it('job is fully resolved', () => {
    expect(job.resolved).toBe(true);
  });
});
