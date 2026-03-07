/**
 * ISS-11: Resolution Algorithm — Mock-based prototype
 *
 * No network calls. We mock KB server responses based on verified API facts
 * (FACT-1..6 from folder-indexing-lifecycle.test.ts) and test:
 *
 *   1. The CURRENT broken logic (from useIndexing + useResourceMerge) → FAILS
 *   2. The NEW resolution algorithm (resolveTick) → PASSES
 *
 * If the "current broken" tests stop failing, something changed in the
 * assumptions — investigate before touching the new algorithm.
 *
 * Scenarios:
 *   A: Flat folder, all processable (acme)
 *   B: Folder with unprocessable file (.DS_Store)
 *   C: Nested folders (2 levels)
 *   D: 3 levels deep
 *   E: Name collision across folders (the localStatuses-by-name bug)
 *   F: Navigation mid-indexing (user navigates away and back)
 *
 * Behavioral scenarios (Phase 2):
 *   I: Concurrent indexing (two folders simultaneously)
 *   J: Navigate away mid-indexing and come back
 *   K: Navigate to unrelated folder mid-indexing
 *   L: Batch index (multiple folders at once)
 *   M: Deindex while indexing
 */
import { describe, expect, it } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

type MockKBEntry = {
  resource_id: string;
  inode_type: 'directory' | 'file';
  inode_path: { path: string };
  status?: string;
};

type TrackedFile = {
  id: string;
  name: string;
  path: string;
  status: 'pending' | 'indexed' | 'error';
};

type TrackedFolder = {
  id: string;
  name: string;
  path: string;
  childFileIds: string[];
  status: 'pending' | 'indexed' | 'error';
};

type IndexingJob = {
  kbId: string;
  folderPath: string;
  files: Map<string, TrackedFile>;
  folder: TrackedFolder;
  resolved: boolean;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Mock data factories
// ═══════════════════════════════════════════════════════════════════════════════

function mkFile(id: string, path: string, status: string): MockKBEntry {
  return { resource_id: id, inode_type: 'file', inode_path: { path }, status };
}

function mkDir(id: string, path: string): MockKBEntry {
  // FACT-1: directories have NO status field (undefined, not null)
  return { resource_id: id, inode_type: 'directory', inode_path: { path } };
}

function extractName(path: string): string {
  const segments = path.replace(/\/$/, '').split('/');
  return segments[segments.length - 1] || path;
}

/**
 * Simulates KB server response timeline.
 * Based on verified facts:
 *   - Tick 0: empty (server hasn't processed yet)
 *   - Tick 1+: files appear with 'pending' then 'indexed'
 *   - Directories always have status=null (FACT-1)
 *   - Unprocessable files never appear (FACT-2)
 *   - Root shows only directories (FACT-3)
 *   - Sub-paths show children (FACT-4)
 */
type MockTimeline = {
  /** KB responses at sub-path per tick. Use 'final' for all ticks after last. */
  subPath: Record<string, MockKBEntry[]>;
  /** KB responses at root per tick (optional). */
  root?: Record<string, MockKBEntry[]>;
};

function getTickResponse(
  timeline: Record<string, MockKBEntry[]>,
  tick: number,
): MockKBEntry[] {
  // Find the highest tick key <= current tick
  const keys = Object.keys(timeline)
    .map(Number)
    .sort((a, b) => a - b);

  let response: MockKBEntry[] = [];
  for (const key of keys) {
    if (key <= tick) {
      response = timeline[key.toString()];
    }
  }
  return response;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CURRENT BROKEN LOGIC (reproduced from useIndexing + useResourceMerge)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Reproduces the statusPriority merge from useResourceMerge.ts.
 * This is the CURRENT production logic.
 */
function statusPriority(s: string | null | undefined): number {
  if (s === 'indexed') return 3;
  if (s === 'pending') return 2;
  if (s === 'resource') return 1;
  return 0;
}

/**
 * Simulates the CURRENT broken indexing flow:
 *
 * 1. handleIndex sets localStatuses[name] = 'pending' for all children
 * 2. On mutation success: sets folder names to 'indexed' immediately
 * 3. useKBResources polls root or sub-path
 * 4. useResourceMerge merges localStatuses + KB data via statusPriority
 * 5. refetchInterval checks if all resources are 'indexed' to stop polling
 *
 * Returns: what the UI would show for each resource after N poll ticks.
 */
function runCurrentLogic(
  /** Resources visible in the connection (what the user sees in the folder) */
  connectionResources: Array<{ id: string; name: string; type: 'file' | 'folder'; status: string | null }>,
  /** The folder being indexed */
  indexedFolder: { name: string; childNames: string[]; childFolderNames: string[] },
  /** KB server responses at ROOT per tick */
  rootTimeline: Record<string, MockKBEntry[]>,
  /** Total ticks to simulate */
  totalTicks: number,
): {
  /** Final status per resource name as shown in UI */
  finalStatuses: Map<string, string>;
  /** Whether polling stopped (refetchInterval returned false) */
  pollingStopped: boolean;
  /** Tick at which polling stopped (-1 if never) */
  stoppedAtTick: number;
} {
  // Step 1: Build localStatuses (what useIndexing.handleIndex does)
  const localStatuses = new Map<string, string>();

  // Set folder + all children to 'pending'
  localStatuses.set(indexedFolder.name, 'pending');
  for (const name of indexedFolder.childNames) {
    localStatuses.set(name, 'pending');
  }

  // Step 2: onSuccess — immediately mark folders as 'indexed'
  // (This is what useIndexing line ~97 does: folderNames.forEach(name => next.set(name, 'indexed')))
  localStatuses.set(indexedFolder.name, 'indexed');
  for (const fn of indexedFolder.childFolderNames) {
    localStatuses.set(fn, 'indexed');
  }

  // Step 3: Simulate polling ticks
  let pollingStopped = false;
  let stoppedAtTick = -1;

  for (let tick = 0; tick < totalTicks; tick++) {
    const kbData = getTickResponse(rootTimeline, tick);

    // Build KB status maps (what useKBResources returns)
    const kbStatusById = new Map(kbData.map((r) => [r.resource_id, r.status]));
    const kbStatusByName = new Map(
      kbData.map((r) => [extractName(r.inode_path.path), r.status]),
    );

    // useResourceMerge: for each connection resource, merge
    const mergedStatuses = new Map<string, string>();
    for (const cr of connectionResources) {
      // Real useResourceMerge: falls back to connection resource status (r.status)
      // KB dirs use virtual IDs — match only works via name
      const serverStatus =
        kbStatusById.get(cr.id) ?? kbStatusByName.get(cr.name) ?? cr.status;
      const localStatus = localStatuses.get(cr.name);

      // statusPriority merge — take the higher one
      const merged =
        localStatus !== undefined &&
        statusPriority(localStatus) > statusPriority(serverStatus)
          ? localStatus
          : serverStatus;

      mergedStatuses.set(cr.name, merged ?? 'null');
    }

    // refetchInterval logic: operates on RAW KB data (before toResource select)
    // Directories have status=undefined, files have 'pending'/'indexed'
    if (kbData.length === 0) {
      // data.length === 0 → keep polling (returns 1000)
      continue;
    }

    const allIndexed = kbData.every((r) => r.status === 'indexed');
    if (allIndexed) {
      pollingStopped = true;
      stoppedAtTick = tick;

      // Return final merged view
      return { finalStatuses: mergedStatuses, pollingStopped, stoppedAtTick };
    }
  }

  // Never stopped — return last state
  const kbData = getTickResponse(rootTimeline, totalTicks - 1);
  const kbStatusById = new Map(kbData.map((r) => [r.resource_id, r.status]));
  const kbStatusByName = new Map(
    kbData.map((r) => [extractName(r.inode_path.path), r.status]),
  );
  const finalStatuses = new Map<string, string>();
  for (const cr of connectionResources) {
    const serverStatus =
      kbStatusById.get(cr.id) ?? kbStatusByName.get(cr.name) ?? cr.status;
    const localStatus = localStatuses.get(cr.name);
    const merged =
      localStatus !== undefined &&
      statusPriority(localStatus) > statusPriority(serverStatus)
        ? localStatus
        : serverStatus;
    finalStatuses.set(cr.name, merged ?? 'null');
  }
  return { finalStatuses, pollingStopped, stoppedAtTick };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW ALGORITHM (from poll-resolve-cycle.test.ts prototype)
// ═══════════════════════════════════════════════════════════════════════════════

function resolveTick(job: IndexingJob, kbResources: MockKBEntry[]): boolean {
  const kbFiles = kbResources.filter((r) => r.inode_type === 'file');
  const kbFileIds = new Set(kbFiles.map((r) => r.resource_id));
  const kbFileNames = new Set(kbFiles.map((r) => extractName(r.inode_path.path)));

  const allServerFilesDone =
    kbFiles.length > 0 && kbFiles.every((r) => r.status === 'indexed');

  for (const [, file] of job.files) {
    if (file.status !== 'pending') continue;

    if (kbFileIds.has(file.id) || kbFileNames.has(file.name)) {
      const kbEntry =
        kbFiles.find((r) => r.resource_id === file.id) ??
        kbFiles.find((r) => extractName(r.inode_path.path) === file.name);
      if (kbEntry?.status === 'indexed') {
        file.status = 'indexed';
        continue;
      }
      continue;
    }

    if (allServerFilesDone) {
      file.status = 'error';
    }
  }

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

function runNewAlgorithm(
  submittedFiles: Array<{ id: string; name: string; path: string }>,
  folder: { id: string; name: string; path: string },
  subPathTimeline: Record<string, MockKBEntry[]>,
  totalTicks: number,
  timeoutTick: number = totalTicks,
): IndexingJob {
  const files = new Map<string, TrackedFile>();
  for (const f of submittedFiles) {
    files.set(f.id, { ...f, status: 'pending' });
  }

  const job: IndexingJob = {
    kbId: 'mock-kb',
    folderPath: `/${folder.name}`,
    files,
    folder: {
      ...folder,
      childFileIds: submittedFiles.map((f) => f.id),
      status: 'pending',
    },
    resolved: false,
  };

  for (let tick = 0; tick < totalTicks; tick++) {
    const kbResources = getTickResponse(subPathTimeline, tick);
    const done = resolveTick(job, kbResources);
    if (done) break;

    // Timeout → force-resolve remaining as error
    if (tick >= timeoutTick - 1) {
      for (const [, file] of job.files) {
        if (file.status === 'pending') file.status = 'error';
      }
      const anyIndexed = [...job.files.values()].some((f) => f.status === 'indexed');
      job.folder.status = anyIndexed ? 'indexed' : 'error';
      job.resolved = true;
      break;
    }
  }

  return job;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BEHAVIORAL INFRASTRUCTURE — JobManager + NavigationSimulator
// ═══════════════════════════════════════════════════════════════════════════════

type JobConfig = {
  folder: { id: string; name: string; path: string };
  files: Array<{ id: string; name: string; path: string }>;
  timeline: Record<string, MockKBEntry[]>;
  timeoutTick?: number;
};

/**
 * Manages multiple concurrent IndexingJobs. Each tick advances ALL active jobs.
 * Models the proposed fix where each folder gets its own tracked job,
 * replacing the current single-kbId approach.
 */
class JobManager {
  readonly jobs = new Map<string, IndexingJob>();
  private timelines = new Map<string, Record<string, MockKBEntry[]>>();
  private timeouts = new Map<string, number>();
  private tickCount = 0;

  startJob(config: JobConfig): IndexingJob {
    const { folder, files, timeline, timeoutTick } = config;
    const trackedFiles = new Map<string, TrackedFile>();
    for (const f of files) {
      trackedFiles.set(f.id, { ...f, status: 'pending' });
    }

    const job: IndexingJob = {
      kbId: `kb-${folder.name}`,
      folderPath: `/${folder.name}`,
      files: trackedFiles,
      folder: {
        ...folder,
        childFileIds: files.map((f) => f.id),
        status: 'pending',
      },
      resolved: false,
    };

    this.jobs.set(folder.path, job);
    this.timelines.set(folder.path, timeline);
    if (timeoutTick !== undefined) this.timeouts.set(folder.path, timeoutTick);
    return job;
  }

  /** Advance one tick for ALL active (unresolved) jobs. */
  tick(): void {
    for (const [path, job] of this.jobs) {
      if (job.resolved) continue;

      const timeline = this.timelines.get(path)!;
      const kbResources = getTickResponse(timeline, this.tickCount);
      resolveTick(job, kbResources);

      // Timeout check
      const timeout = this.timeouts.get(path);
      if (timeout !== undefined && this.tickCount >= timeout - 1 && !job.resolved) {
        for (const [, file] of job.files) {
          if (file.status === 'pending') file.status = 'error';
        }
        const anyIndexed = [...job.files.values()].some((f) => f.status === 'indexed');
        job.folder.status = anyIndexed ? 'indexed' : 'error';
        job.resolved = true;
      }
    }
    this.tickCount++;
  }

  /** Run ticks until all jobs resolve or maxTicks reached. */
  runUntilDone(maxTicks: number): number {
    for (let t = 0; t < maxTicks; t++) {
      this.tick();
      if (this.allResolved()) return this.tickCount;
    }
    return this.tickCount;
  }

  allResolved(): boolean {
    for (const job of this.jobs.values()) {
      if (!job.resolved) return false;
    }
    return this.jobs.size > 0;
  }

  /** Remove a file from an active job (models deindex). */
  removeFile(folderPath: string, fileId: string): boolean {
    const job = this.jobs.get(folderPath);
    if (!job) return false;
    const deleted = job.files.delete(fileId);
    if (deleted) {
      job.folder.childFileIds = job.folder.childFileIds.filter((id) => id !== fileId);
      // Re-derive folder status
      const values = [...job.files.values()];
      if (values.length === 0) {
        job.folder.status = 'error';
        job.resolved = true;
      } else {
        const anyPending = values.some((f) => f.status === 'pending');
        if (!anyPending) {
          const anyIndexed = values.some((f) => f.status === 'indexed');
          job.folder.status = anyIndexed ? 'indexed' : 'error';
          job.resolved = true;
        }
      }
    }
    return deleted;
  }

  /** Get merged status map for all files across all jobs (keyed by file ID). */
  getAllStatuses(): Map<string, string> {
    const result = new Map<string, string>();
    for (const job of this.jobs.values()) {
      for (const [id, file] of job.files) {
        result.set(id, file.status);
      }
      result.set(job.folder.id, job.folder.status);
    }
    return result;
  }
}

type ConnectionResource = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  status: string | null;
  parentPath: string; // which folder this resource belongs to
};

/**
 * Simulates folder navigation + status visibility.
 * Models how the UI merges connection resources with job statuses
 * at the current navigation path.
 */
class NavigationSimulator {
  currentPath = '/';
  private allResources: ConnectionResource[] = [];

  addResources(resources: ConnectionResource[]): void {
    this.allResources.push(...resources);
  }

  navigate(path: string): void {
    this.currentPath = path;
  }

  /** Get what the UI would show at the current path, merging job statuses. */
  getVisibleStatuses(jobManager: JobManager): Map<string, string> {
    const visible = this.allResources.filter((r) => r.parentPath === this.currentPath);
    const allStatuses = jobManager.getAllStatuses();
    const result = new Map<string, string>();

    for (const r of visible) {
      // New merge rule: server 'indexed' always wins,
      // else if submitted → 'pending', else connection status
      const jobStatus = allStatuses.get(r.id);
      result.set(r.id, jobStatus ?? r.status ?? 'null');
    }
    return result;
  }

  /**
   * Simulates CURRENT broken logic: merges via localStatuses (keyed by NAME).
   * All submitted file names go into a single Map — cross-folder collision.
   */
  getVisibleStatusesBroken(
    submittedNames: Map<string, string>,
  ): Map<string, string> {
    const visible = this.allResources.filter((r) => r.parentPath === this.currentPath);
    const result = new Map<string, string>();

    for (const r of visible) {
      const localStatus = submittedNames.get(r.name);
      const serverStatus = r.status;
      // statusPriority merge (current broken behavior)
      const merged =
        localStatus !== undefined &&
        statusPriority(localStatus) > statusPriority(serverStatus)
          ? localStatus
          : serverStatus;
      result.set(r.id, merged ?? 'null');
    }
    return result;
  }
}

/**
 * Simulates the refetchInterval logic from useKnowledgeBase.ts.
 * Reproduces how polling decides whether to continue or stop.
 *
 * CURRENT broken logic:
 *   data.length === 0 → return 1000 (poll forever, no guard)
 *   data.every(indexed) → return false (stop)
 *   else → return 1000
 *
 * NEW logic (with hasLocalPending guard):
 *   data.length === 0 && !hasLocalPending → return false (stop)
 *   data.length === 0 && hasLocalPending → return 1000 (KB building)
 *   data.every(indexed) → return false (stop)
 *   else → return 1000
 */
function currentPollingDecision(
  kbData: MockKBEntry[],
): number | false {
  if (kbData.length === 0) return 1000; // ← BUG: no hasLocalPending guard
  const allIndexed = kbData.every((r) => r.status === 'indexed');
  return allIndexed ? false : 1000;
}

function newPollingDecision(
  kbData: MockKBEntry[],
  hasLocalPending: boolean,
): number | false {
  if (kbData.length === 0) return hasLocalPending ? 1000 : false;
  const allIndexed = kbData.every((r) => r.status === 'indexed');
  return allIndexed ? false : 1000;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO A: Flat folder, all processable (acme)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario A: flat folder, all processable', () => {
  const connectionResources = [
    { id: 'f1', name: 'report.pdf', type: 'file' as const, status: 'resource' as string | null },
    { id: 'f2', name: 'data.csv', type: 'file' as const, status: 'resource' as string | null },
    { id: 'f3', name: 'memo.pdf', type: 'file' as const, status: 'resource' as string | null },
  ];

  // KB root: only directories with NO status (FACT-3, FACT-1)
  // IMPORTANT: KB uses virtual ID, NOT the connection resource ID
  const rootTimeline: Record<string, MockKBEntry[]> = {
    '0': [], // empty right after sync
    '1': [mkDir('STACK_VFS_VIRTUAL_DIRECTORY', 'acme')],
    // Stays like this forever — dirs never get indexed (FACT-6)
  };

  // KB sub-path /acme: files appear and get indexed (FACT-4, FACT-5)
  const subPathTimeline: Record<string, MockKBEntry[]> = {
    '0': [], // empty
    '1': [
      mkFile('f1', 'acme/report.pdf', 'pending'),
      mkFile('f2', 'acme/data.csv', 'pending'),
      mkFile('f3', 'acme/memo.pdf', 'pending'),
    ],
    '3': [
      mkFile('f1', 'acme/report.pdf', 'indexed'),
      mkFile('f2', 'acme/data.csv', 'indexed'),
      mkFile('f3', 'acme/memo.pdf', 'indexed'),
    ],
  };

  describe('CURRENT logic (broken)', () => {
    it('polling never stops — root dirs have null status', () => {
      const result = runCurrentLogic(
        connectionResources,
        { name: 'acme', childNames: ['report.pdf', 'data.csv', 'memo.pdf'], childFolderNames: [] },
        rootTimeline,
        20, // simulate 20 ticks
      );

      // BUG B3: root only has directory with null status
      // `kbData.every(r => r.status === 'indexed')` is false forever
      expect(result.pollingStopped).toBe(false);
      expect(result.stoppedAtTick).toBe(-1);
    });

    it('files show as pending forever (no sub-path polling)', () => {
      const result = runCurrentLogic(
        connectionResources,
        { name: 'acme', childNames: ['report.pdf', 'data.csv', 'memo.pdf'], childFolderNames: [] },
        rootTimeline,
        20,
      );

      // BUG: current code polls root, not sub-path.
      // Root has no file entries → localStatuses 'pending' wins via statusPriority
      // Files stay 'pending' forever in the UI
      for (const [name, status] of result.finalStatuses) {
        if (name !== 'acme') {
          expect(status).toBe('pending'); // stuck!
        }
      }
    });

    it('folder is falsely shown as indexed (onSuccess premature)', () => {
      // When the user navigates INTO acme and is looking at files,
      // 'acme' itself is in the parent's connection list, not in connectionResources.
      // But localStatuses.set('acme', 'indexed') happens on onSuccess.
      // If the user navigates BACK to root, the parent view merges localStatuses
      // and shows 'acme' as indexed even though files are still pending.
      const parentView = [
        { id: 'd-acme', name: 'acme', type: 'folder' as const, status: null as string | null },
        { id: 'd-other', name: 'other', type: 'folder' as const, status: null as string | null },
      ];

      const result = runCurrentLogic(
        parentView,
        { name: 'acme', childNames: ['report.pdf', 'data.csv', 'memo.pdf'], childFolderNames: [] },
        rootTimeline,
        20,
      );

      // BUG B1: onSuccess immediately sets folder to 'indexed'
      // before ANY file is actually indexed on the server
      expect(result.finalStatuses.get('acme')).toBe('indexed');
    });
  });

  describe('NEW algorithm', () => {
    it('resolves all files as indexed', () => {
      const job = runNewAlgorithm(
        [
          { id: 'f1', name: 'report.pdf', path: 'acme/report.pdf' },
          { id: 'f2', name: 'data.csv', path: 'acme/data.csv' },
          { id: 'f3', name: 'memo.pdf', path: 'acme/memo.pdf' },
        ],
        { id: 'd-acme', name: 'acme', path: 'acme/' },
        subPathTimeline,
        10,
      );

      expect(job.resolved).toBe(true);
      for (const file of job.files.values()) {
        expect(file.status).toBe('indexed');
      }
    });

    it('derives folder as indexed', () => {
      const job = runNewAlgorithm(
        [
          { id: 'f1', name: 'report.pdf', path: 'acme/report.pdf' },
          { id: 'f2', name: 'data.csv', path: 'acme/data.csv' },
          { id: 'f3', name: 'memo.pdf', path: 'acme/memo.pdf' },
        ],
        { id: 'd-acme', name: 'acme', path: 'acme/' },
        subPathTimeline,
        10,
      );

      expect(job.folder.status).toBe('indexed');
    });

    it('zero files stuck in pending', () => {
      const job = runNewAlgorithm(
        [
          { id: 'f1', name: 'report.pdf', path: 'acme/report.pdf' },
          { id: 'f2', name: 'data.csv', path: 'acme/data.csv' },
          { id: 'f3', name: 'memo.pdf', path: 'acme/memo.pdf' },
        ],
        { id: 'd-acme', name: 'acme', path: 'acme/' },
        subPathTimeline,
        10,
      );

      const pending = [...job.files.values()].filter((f) => f.status === 'pending');
      expect(pending.length).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO B: Folder with unprocessable file (.DS_Store)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario B: folder with .DS_Store', () => {
  const connectionResources = [
    { id: 'f1', name: '.DS_Store', type: 'file' as const, status: 'resource' as string | null },
    { id: 'f2', name: 'reference_list.txt', type: 'file' as const, status: 'resource' as string | null },
  ];

  const rootTimeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '1': [mkDir('STACK_VFS_VIRTUAL_DIRECTORY', 'references')],
  };

  // FACT-2: .DS_Store never appears in KB
  const subPathTimeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '1': [mkFile('f2', 'references/reference_list.txt', 'pending')],
    '3': [mkFile('f2', 'references/reference_list.txt', 'indexed')],
    // .DS_Store NEVER appears — silently skipped
  };

  describe('CURRENT logic (broken)', () => {
    it('.DS_Store stays pending forever', () => {
      const result = runCurrentLogic(
        connectionResources,
        {
          name: 'references',
          childNames: ['.DS_Store', 'reference_list.txt'],
          childFolderNames: [],
        },
        rootTimeline,
        20,
      );

      // BUG B4: .DS_Store set to 'pending' in localStatuses
      // Server never returns it → nothing transitions it out of pending
      // statusPriority: local 'pending' (2) > server null (0) → stays 'pending'
      expect(result.finalStatuses.get('.DS_Store')).toBe('pending');
    });

    it('polling never stops', () => {
      const result = runCurrentLogic(
        connectionResources,
        {
          name: 'references',
          childNames: ['.DS_Store', 'reference_list.txt'],
          childFolderNames: [],
        },
        rootTimeline,
        20,
      );

      expect(result.pollingStopped).toBe(false);
    });
  });

  describe('NEW algorithm', () => {
    it('.DS_Store resolved as error', () => {
      const job = runNewAlgorithm(
        [
          { id: 'f1', name: '.DS_Store', path: 'references/.DS_Store' },
          { id: 'f2', name: 'reference_list.txt', path: 'references/reference_list.txt' },
        ],
        { id: 'd-refs', name: 'references', path: 'references/' },
        subPathTimeline,
        10,
      );

      const ds = job.files.get('f1');
      expect(ds?.status).toBe('error');
    });

    it('reference_list.txt resolved as indexed', () => {
      const job = runNewAlgorithm(
        [
          { id: 'f1', name: '.DS_Store', path: 'references/.DS_Store' },
          { id: 'f2', name: 'reference_list.txt', path: 'references/reference_list.txt' },
        ],
        { id: 'd-refs', name: 'references', path: 'references/' },
        subPathTimeline,
        10,
      );

      const ref = job.files.get('f2');
      expect(ref?.status).toBe('indexed');
    });

    it('folder derives to indexed (has indexed child)', () => {
      const job = runNewAlgorithm(
        [
          { id: 'f1', name: '.DS_Store', path: 'references/.DS_Store' },
          { id: 'f2', name: 'reference_list.txt', path: 'references/reference_list.txt' },
        ],
        { id: 'd-refs', name: 'references', path: 'references/' },
        subPathTimeline,
        10,
      );

      expect(job.folder.status).toBe('indexed');
      expect(job.resolved).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO C: Nested folders (2 levels)
// /projects/
//   readme.pdf
//   /docs/
//     guide.pdf
//     .gitkeep    (unprocessable)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario C: nested folders (2 levels)', () => {
  // Sub-path /projects returns direct children
  const projectsTimeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '1': [
      mkFile('f1', 'projects/readme.pdf', 'pending'),
      mkDir('STACK_VFS_VIRTUAL_DIRECTORY', 'projects/docs'),
    ],
    '3': [
      mkFile('f1', 'projects/readme.pdf', 'indexed'),
      mkDir('STACK_VFS_VIRTUAL_DIRECTORY', 'projects/docs'),
    ],
  };

  // Sub-path /projects/docs returns docs children
  const docsTimeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '1': [mkFile('f2', 'projects/docs/guide.pdf', 'pending')],
    '4': [mkFile('f2', 'projects/docs/guide.pdf', 'indexed')],
    // .gitkeep never appears (FACT-2)
  };

  describe('NEW algorithm — level 1 (projects)', () => {
    it('resolves readme.pdf at projects level', () => {
      // Only tracking files at this folder level
      const job = runNewAlgorithm(
        [{ id: 'f1', name: 'readme.pdf', path: 'projects/readme.pdf' }],
        { id: 'd-proj', name: 'projects', path: 'projects/' },
        projectsTimeline,
        10,
      );

      expect(job.files.get('f1')?.status).toBe('indexed');
      expect(job.resolved).toBe(true);
    });
  });

  describe('NEW algorithm — level 2 (docs with .gitkeep)', () => {
    it('resolves guide.pdf as indexed', () => {
      const job = runNewAlgorithm(
        [
          { id: 'f2', name: 'guide.pdf', path: 'projects/docs/guide.pdf' },
          { id: 'f3', name: '.gitkeep', path: 'projects/docs/.gitkeep' },
        ],
        { id: 'd-docs', name: 'docs', path: 'projects/docs/' },
        docsTimeline,
        10,
      );

      expect(job.files.get('f2')?.status).toBe('indexed');
    });

    it('resolves .gitkeep as error (skipped)', () => {
      const job = runNewAlgorithm(
        [
          { id: 'f2', name: 'guide.pdf', path: 'projects/docs/guide.pdf' },
          { id: 'f3', name: '.gitkeep', path: 'projects/docs/.gitkeep' },
        ],
        { id: 'd-docs', name: 'docs', path: 'projects/docs/' },
        docsTimeline,
        10,
      );

      expect(job.files.get('f3')?.status).toBe('error');
      expect(job.folder.status).toBe('indexed');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO D: 3 levels deep
// /company/
//   /dept/
//     /team/
//       report.pdf
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario D: 3 levels deep', () => {
  const teamTimeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '2': [mkFile('f1', 'company/dept/team/report.pdf', 'pending')],
    '5': [mkFile('f1', 'company/dept/team/report.pdf', 'indexed')],
  };

  it('resolves deeply nested file', () => {
    const job = runNewAlgorithm(
      [{ id: 'f1', name: 'report.pdf', path: 'company/dept/team/report.pdf' }],
      { id: 'd-team', name: 'team', path: 'company/dept/team/' },
      teamTimeline,
      10,
    );

    expect(job.files.get('f1')?.status).toBe('indexed');
    expect(job.folder.status).toBe('indexed');
    expect(job.resolved).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO E: Name collision across folders
// /folder1/readme.pdf  and  /folder2/readme.pdf
// Current bug: localStatuses keyed by name → second overwrites first
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario E: name collision across folders', () => {
  const folder1Timeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '2': [mkFile('f1', 'folder1/readme.pdf', 'indexed')],
  };

  const folder2Timeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '3': [mkFile('f2', 'folder2/readme.pdf', 'indexed')],
  };

  describe('CURRENT logic (broken)', () => {
    it('second folder overwrites first in localStatuses (name collision)', () => {
      // Simulate: user indexes folder1, then folder2.
      // Both have 'readme.pdf' — localStatuses keyed by name
      const localStatuses = new Map<string, string>();

      // handleIndex(folder1) sets children
      localStatuses.set('readme.pdf', 'pending'); // folder1's file

      // handleIndex(folder2) sets children — OVERWRITES!
      localStatuses.set('readme.pdf', 'pending'); // folder2's file

      // There's only ONE entry for 'readme.pdf' — we lost track of folder1's
      expect(localStatuses.size).toBe(1); // should be 2 if keyed properly

      // BUG B2: can't distinguish folder1/readme.pdf from folder2/readme.pdf
    });
  });

  describe('NEW algorithm', () => {
    it('tracks each file by ID — no collision', () => {
      // Job 1: folder1
      const job1 = runNewAlgorithm(
        [{ id: 'f1', name: 'readme.pdf', path: 'folder1/readme.pdf' }],
        { id: 'd-f1', name: 'folder1', path: 'folder1/' },
        folder1Timeline,
        10,
      );

      // Job 2: folder2
      const job2 = runNewAlgorithm(
        [{ id: 'f2', name: 'readme.pdf', path: 'folder2/readme.pdf' }],
        { id: 'd-f2', name: 'folder2', path: 'folder2/' },
        folder2Timeline,
        10,
      );

      // Both resolve independently — keyed by ID, not name
      expect(job1.files.get('f1')?.status).toBe('indexed');
      expect(job2.files.get('f2')?.status).toBe('indexed');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO F: Timeout — server never indexes a file
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario F: timeout fallback', () => {
  const timeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '2': [mkFile('f1', 'slow/report.pdf', 'pending')],
    // Never reaches 'indexed' — stuck forever on server
  };

  it('timeout forces remaining files to error', () => {
    const job = runNewAlgorithm(
      [{ id: 'f1', name: 'report.pdf', path: 'slow/report.pdf' }],
      { id: 'd-slow', name: 'slow', path: 'slow/' },
      timeline,
      10,
      5, // timeout at tick 5
    );

    expect(job.files.get('f1')?.status).toBe('error');
    expect(job.folder.status).toBe('error');
    expect(job.resolved).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO G: Empty folder
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario G: empty folder (no files)', () => {
  it('vacuous truth — folder with 0 files resolves immediately as error', () => {
    const job = runNewAlgorithm(
      [], // no files
      { id: 'd-empty', name: 'empty', path: 'empty/' },
      { '0': [] },
      5,
    );

    // No files → resolved immediately (nothing to poll)
    // Folder with zero files = error (nothing was indexed)
    expect(job.resolved).toBe(true);
    expect(job.folder.status).toBe('error');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO H: All files unprocessable
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario H: all files unprocessable', () => {
  const timeline: Record<string, MockKBEntry[]> = {
    '0': [],
    // Server returns nothing — all files skipped
    // But we need "all server files done" signal...
    // Edge case: kbFiles.length === 0 → allServerFilesDone is false
    // So without timeout, this stays pending forever!
  };

  it('timeout resolves all as error when server returns nothing', () => {
    const job = runNewAlgorithm(
      [
        { id: 'f1', name: '.DS_Store', path: 'junk/.DS_Store' },
        { id: 'f2', name: '.gitkeep', path: 'junk/.gitkeep' },
      ],
      { id: 'd-junk', name: 'junk', path: 'junk/' },
      timeline,
      10,
      5, // timeout at tick 5
    );

    expect(job.files.get('f1')?.status).toBe('error');
    expect(job.files.get('f2')?.status).toBe('error');
    expect(job.folder.status).toBe('error');
    expect(job.resolved).toBe(true);
  });

  it('without timeout, stays pending forever (edge case to handle)', () => {
    const job = runNewAlgorithm(
      [
        { id: 'f1', name: '.DS_Store', path: 'junk/.DS_Store' },
        { id: 'f2', name: '.gitkeep', path: 'junk/.gitkeep' },
      ],
      { id: 'd-junk', name: 'junk', path: 'junk/' },
      timeline,
      10,
      999, // no timeout within test range
    );

    // Without timeout AND without any server files → all-siblings-done
    // heuristic doesn't fire (kbFiles.length === 0 → allServerFilesDone = false)
    // Files stay pending — this is WHY timeout is mandatory
    const pending = [...job.files.values()].filter((f) => f.status === 'pending');
    expect(pending.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO I: Concurrent indexing (two folders simultaneously)
//
// User indexes folder1. While folder1 is still processing, user indexes folder2.
// CURRENT bug: second setKbId('kb2') overwrites first → folder1 never polled.
// NEW algorithm: JobManager tracks both independently.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario I: concurrent indexing (two folders)', () => {
  // folder1: 3 files, indexed by tick 4
  const folder1Timeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '1': [
      mkFile('f1', 'reports/q1.pdf', 'pending'),
      mkFile('f2', 'reports/q2.pdf', 'pending'),
    ],
    '4': [
      mkFile('f1', 'reports/q1.pdf', 'indexed'),
      mkFile('f2', 'reports/q2.pdf', 'indexed'),
    ],
  };

  // folder2: 1 file, indexed by tick 3 (finishes faster)
  const folder2Timeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '1': [mkFile('f3', 'invoices/receipt.pdf', 'pending')],
    '3': [mkFile('f3', 'invoices/receipt.pdf', 'indexed')],
  };

  describe('CURRENT logic (broken)', () => {
    it('second folder overwrites kbId — first folder stuck', () => {
      // Simulate the current broken flow:
      // handleIndex(folder1) → setKbId('kb1'), localStatuses = {q1: pending, q2: pending}
      // handleIndex(folder2) → setKbId('kb2'), localStatuses += {receipt: pending}
      // Only kb2 is polled. folder1's files never get server updates.
      const localStatuses = new Map<string, string>();
      let kbId = '';

      // handleIndex(folder1)
      localStatuses.set('q1.pdf', 'pending');
      localStatuses.set('q2.pdf', 'pending');
      localStatuses.set('reports', 'pending');
      kbId = 'kb1';

      // onSuccess(folder1) → mark folder 'indexed'
      localStatuses.set('reports', 'indexed');

      // handleIndex(folder2) — while folder1 still processing
      localStatuses.set('receipt.pdf', 'pending');
      localStatuses.set('invoices', 'pending');
      kbId = 'kb2'; // ← OVERWRITES kb1!

      // onSuccess(folder2)
      localStatuses.set('invoices', 'indexed');

      // Now: kbId = 'kb2', but localStatuses has folder1's files too
      expect(kbId).toBe('kb2'); // kb1 lost
      expect(localStatuses.get('q1.pdf')).toBe('pending'); // stuck forever
      expect(localStatuses.get('q2.pdf')).toBe('pending'); // stuck forever
    });
  });

  describe('NEW algorithm (JobManager)', () => {
    it('both folders resolve independently', () => {
      const mgr = new JobManager();

      mgr.startJob({
        folder: { id: 'd-reports', name: 'reports', path: 'reports/' },
        files: [
          { id: 'f1', name: 'q1.pdf', path: 'reports/q1.pdf' },
          { id: 'f2', name: 'q2.pdf', path: 'reports/q2.pdf' },
        ],
        timeline: folder1Timeline,
      });

      // folder2 started 1 tick later (but same simulation)
      mgr.startJob({
        folder: { id: 'd-invoices', name: 'invoices', path: 'invoices/' },
        files: [{ id: 'f3', name: 'receipt.pdf', path: 'invoices/receipt.pdf' }],
        timeline: folder2Timeline,
      });

      mgr.runUntilDone(10);

      expect(mgr.allResolved()).toBe(true);

      const reportsJob = mgr.jobs.get('reports/')!;
      expect(reportsJob.files.get('f1')?.status).toBe('indexed');
      expect(reportsJob.files.get('f2')?.status).toBe('indexed');
      expect(reportsJob.folder.status).toBe('indexed');

      const invoicesJob = mgr.jobs.get('invoices/')!;
      expect(invoicesJob.files.get('f3')?.status).toBe('indexed');
      expect(invoicesJob.folder.status).toBe('indexed');
    });

    it('faster folder resolves first, slower continues', () => {
      const mgr = new JobManager();

      mgr.startJob({
        folder: { id: 'd-reports', name: 'reports', path: 'reports/' },
        files: [
          { id: 'f1', name: 'q1.pdf', path: 'reports/q1.pdf' },
          { id: 'f2', name: 'q2.pdf', path: 'reports/q2.pdf' },
        ],
        timeline: folder1Timeline,
      });

      mgr.startJob({
        folder: { id: 'd-invoices', name: 'invoices', path: 'invoices/' },
        files: [{ id: 'f3', name: 'receipt.pdf', path: 'invoices/receipt.pdf' }],
        timeline: folder2Timeline,
      });

      // Tick 0..3 — invoices should resolve at tick 3
      for (let i = 0; i < 4; i++) mgr.tick();

      const invoicesJob = mgr.jobs.get('invoices/')!;
      expect(invoicesJob.resolved).toBe(true);
      expect(invoicesJob.files.get('f3')?.status).toBe('indexed');

      // reports still processing
      const reportsJob = mgr.jobs.get('reports/')!;
      expect(reportsJob.resolved).toBe(false);
      expect(reportsJob.files.get('f1')?.status).toBe('pending');

      // Tick 4 — reports resolves
      mgr.tick();
      expect(reportsJob.resolved).toBe(true);
      expect(reportsJob.files.get('f1')?.status).toBe('indexed');
      expect(reportsJob.files.get('f2')?.status).toBe('indexed');
    });

    it('getAllStatuses merges both jobs without collision', () => {
      const mgr = new JobManager();

      mgr.startJob({
        folder: { id: 'd-reports', name: 'reports', path: 'reports/' },
        files: [{ id: 'f1', name: 'q1.pdf', path: 'reports/q1.pdf' }],
        timeline: folder1Timeline,
      });

      mgr.startJob({
        folder: { id: 'd-invoices', name: 'invoices', path: 'invoices/' },
        files: [{ id: 'f3', name: 'receipt.pdf', path: 'invoices/receipt.pdf' }],
        timeline: folder2Timeline,
      });

      mgr.runUntilDone(10);

      const statuses = mgr.getAllStatuses();
      expect(statuses.get('f1')).toBe('indexed');
      expect(statuses.get('f3')).toBe('indexed');
      expect(statuses.get('d-reports')).toBe('indexed');
      expect(statuses.get('d-invoices')).toBe('indexed');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO J: Navigate away mid-indexing and come back
//
// User indexes folder "docs" from root, navigates INTO "docs" while files
// are still pending, then navigates BACK to root.
// CURRENT bug: localStatuses follow navigation → stale 'pending' shown.
// NEW algorithm: job resolves in background; navigation just reads job state.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario J: navigate away mid-indexing', () => {
  const docsTimeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '2': [
      mkFile('f1', 'docs/spec.pdf', 'pending'),
      mkFile('f2', 'docs/design.pdf', 'pending'),
    ],
    '5': [
      mkFile('f1', 'docs/spec.pdf', 'indexed'),
      mkFile('f2', 'docs/design.pdf', 'indexed'),
    ],
  };

  // Connection resources at root level (parent view)
  const rootResources: ConnectionResource[] = [
    { id: 'd-docs', name: 'docs', type: 'folder', status: null, parentPath: '/' },
    { id: 'd-other', name: 'other', type: 'folder', status: null, parentPath: '/' },
  ];

  // Connection resources inside /docs (child view)
  const docsResources: ConnectionResource[] = [
    { id: 'f1', name: 'spec.pdf', type: 'file', status: 'resource', parentPath: '/docs' },
    { id: 'f2', name: 'design.pdf', type: 'file', status: 'resource', parentPath: '/docs' },
  ];

  describe('NEW algorithm (NavigationSimulator)', () => {
    it('shows pending at root, then indexed after resolution', () => {
      const mgr = new JobManager();
      const nav = new NavigationSimulator();

      nav.addResources(rootResources);
      nav.addResources(docsResources);

      mgr.startJob({
        folder: { id: 'd-docs', name: 'docs', path: 'docs/' },
        files: [
          { id: 'f1', name: 'spec.pdf', path: 'docs/spec.pdf' },
          { id: 'f2', name: 'design.pdf', path: 'docs/design.pdf' },
        ],
        timeline: docsTimeline,
      });

      // At root, tick 0 — folder shows pending
      nav.navigate('/');
      mgr.tick(); // tick 0
      let visible = nav.getVisibleStatuses(mgr);
      expect(visible.get('d-docs')).toBe('pending');
      expect(visible.get('d-other')).toBe('null'); // unrelated, untouched

      // Run to completion
      mgr.runUntilDone(10);
      visible = nav.getVisibleStatuses(mgr);
      expect(visible.get('d-docs')).toBe('indexed');
    });

    it('navigate INTO folder mid-indexing → see file statuses', () => {
      const mgr = new JobManager();
      const nav = new NavigationSimulator();

      nav.addResources(rootResources);
      nav.addResources(docsResources);

      mgr.startJob({
        folder: { id: 'd-docs', name: 'docs', path: 'docs/' },
        files: [
          { id: 'f1', name: 'spec.pdf', path: 'docs/spec.pdf' },
          { id: 'f2', name: 'design.pdf', path: 'docs/design.pdf' },
        ],
        timeline: docsTimeline,
      });

      // Tick 0..2 — files appear as pending
      mgr.tick(); mgr.tick(); mgr.tick();

      // Navigate into docs
      nav.navigate('/docs');
      let visible = nav.getVisibleStatuses(mgr);
      expect(visible.get('f1')).toBe('pending');
      expect(visible.get('f2')).toBe('pending');

      // Tick 3..5 — files become indexed
      mgr.tick(); mgr.tick(); mgr.tick();
      visible = nav.getVisibleStatuses(mgr);
      expect(visible.get('f1')).toBe('indexed');
      expect(visible.get('f2')).toBe('indexed');
    });

    it('navigate into folder, then BACK to root → folder derived as indexed', () => {
      const mgr = new JobManager();
      const nav = new NavigationSimulator();

      nav.addResources(rootResources);
      nav.addResources(docsResources);

      mgr.startJob({
        folder: { id: 'd-docs', name: 'docs', path: 'docs/' },
        files: [
          { id: 'f1', name: 'spec.pdf', path: 'docs/spec.pdf' },
          { id: 'f2', name: 'design.pdf', path: 'docs/design.pdf' },
        ],
        timeline: docsTimeline,
      });

      // Navigate into docs
      nav.navigate('/docs');
      mgr.runUntilDone(10);

      // Navigate back to root
      nav.navigate('/');
      const visible = nav.getVisibleStatuses(mgr);
      // Folder status is derived from job state, not from localStatuses
      expect(visible.get('d-docs')).toBe('indexed');
      expect(visible.get('d-other')).toBe('null'); // untouched
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO K: Navigate to unrelated folder mid-indexing
//
// User indexes "reports", then navigates to "photos" (unrelated).
// CURRENT bug: localStatuses keyed by name leaks — if photos has a file
// with the same name as one in reports, it shows 'pending' spuriously.
// NEW algorithm: jobs are scoped by folder path — no leak.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario K: navigate to unrelated folder mid-indexing', () => {
  const reportsTimeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '2': [mkFile('f1', 'reports/summary.pdf', 'pending')],
    '5': [mkFile('f1', 'reports/summary.pdf', 'indexed')],
  };

  const rootResources: ConnectionResource[] = [
    { id: 'd-reports', name: 'reports', type: 'folder', status: null, parentPath: '/' },
    { id: 'd-photos', name: 'photos', type: 'folder', status: null, parentPath: '/' },
  ];

  const reportsResources: ConnectionResource[] = [
    { id: 'f1', name: 'summary.pdf', type: 'file', status: 'resource', parentPath: '/reports' },
  ];

  // photos has a file with the SAME NAME as one in reports
  const photosResources: ConnectionResource[] = [
    { id: 'f9', name: 'summary.pdf', type: 'file', status: 'resource', parentPath: '/photos' },
    { id: 'f10', name: 'cat.jpg', type: 'file', status: 'resource', parentPath: '/photos' },
  ];

  describe('CURRENT logic (broken)', () => {
    it('name collision leaks pending to unrelated folder', () => {
      const nav = new NavigationSimulator();
      nav.addResources(rootResources);
      nav.addResources(reportsResources);
      nav.addResources(photosResources);

      // Current handleIndex sets localStatuses by NAME
      const localStatuses = new Map<string, string>();
      localStatuses.set('summary.pdf', 'pending'); // from reports

      // Navigate to photos — user sees photos/summary.pdf
      nav.navigate('/photos');
      const visible = nav.getVisibleStatusesBroken(localStatuses);

      // BUG: photos/summary.pdf shows 'pending' because localStatuses
      // matches by name, not by folder-scoped ID
      expect(visible.get('f9')).toBe('pending'); // should be 'resource'!
    });
  });

  describe('NEW algorithm', () => {
    it('unrelated folder shows no spurious pending', () => {
      const mgr = new JobManager();
      const nav = new NavigationSimulator();

      nav.addResources(rootResources);
      nav.addResources(reportsResources);
      nav.addResources(photosResources);

      mgr.startJob({
        folder: { id: 'd-reports', name: 'reports', path: 'reports/' },
        files: [{ id: 'f1', name: 'summary.pdf', path: 'reports/summary.pdf' }],
        timeline: reportsTimeline,
      });

      // Navigate to photos mid-indexing
      mgr.tick(); mgr.tick();
      nav.navigate('/photos');
      const visible = nav.getVisibleStatuses(mgr);

      // photos/summary.pdf (f9) is NOT tracked in any job → shows connection status
      expect(visible.get('f9')).toBe('resource');
      expect(visible.get('f10')).toBe('resource');
    });

    it('reports folder still resolves in background', () => {
      const mgr = new JobManager();
      const nav = new NavigationSimulator();

      nav.addResources(rootResources);
      nav.addResources(reportsResources);
      nav.addResources(photosResources);

      mgr.startJob({
        folder: { id: 'd-reports', name: 'reports', path: 'reports/' },
        files: [{ id: 'f1', name: 'summary.pdf', path: 'reports/summary.pdf' }],
        timeline: reportsTimeline,
      });

      // Navigate to photos, let time pass
      nav.navigate('/photos');
      mgr.runUntilDone(10);

      // Navigate back to root
      nav.navigate('/');
      const visible = nav.getVisibleStatuses(mgr);
      expect(visible.get('d-reports')).toBe('indexed');
      expect(visible.get('d-photos')).toBe('null'); // never indexed
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO L: Batch index (multiple folders at once)
//
// User selects folderA + folderB + a single file, clicks "Index".
// useBatchActions loops: handleIndex(folderA), handleIndex(folderB), handleIndex(file).
// CURRENT bug: each handleIndex calls setKbId → only last one survives.
// NEW algorithm: one job per folder, single files tracked separately.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario L: batch index (folders + file)', () => {
  const alphaTimeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '1': [mkFile('f1', 'alpha/a1.pdf', 'pending')],
    '3': [mkFile('f1', 'alpha/a1.pdf', 'indexed')],
  };

  const betaTimeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '2': [
      mkFile('f2', 'beta/b1.pdf', 'pending'),
      mkFile('f3', 'beta/b2.pdf', 'pending'),
    ],
    '4': [
      mkFile('f2', 'beta/b1.pdf', 'indexed'),
      mkFile('f3', 'beta/b2.pdf', 'indexed'),
    ],
  };

  // Single file at root level (not inside a subfolder)
  const singleFileTimeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '1': [mkFile('f4', 'readme.md', 'pending')],
    '2': [mkFile('f4', 'readme.md', 'indexed')],
  };

  describe('CURRENT logic (broken)', () => {
    it('loop overwrites kbId — only last folder tracked', () => {
      let kbId = '';
      const localStatuses = new Map<string, string>();

      // handleBatchIndex loops through selected items:
      // handleIndex(alpha) → creates KB, sets kbId
      localStatuses.set('a1.pdf', 'pending');
      localStatuses.set('alpha', 'pending');
      kbId = 'kb-alpha';
      localStatuses.set('alpha', 'indexed'); // onSuccess

      // handleIndex(beta)
      localStatuses.set('b1.pdf', 'pending');
      localStatuses.set('b2.pdf', 'pending');
      localStatuses.set('beta', 'pending');
      kbId = 'kb-beta'; // ← OVERWRITES
      localStatuses.set('beta', 'indexed'); // onSuccess

      // handleIndex(readme.md) — single file
      localStatuses.set('readme.md', 'pending');
      kbId = 'kb-readme'; // ← OVERWRITES AGAIN

      expect(kbId).toBe('kb-readme'); // alpha and beta KBs lost
      // Only kb-readme is polled → alpha/beta files stuck pending
      expect(localStatuses.get('a1.pdf')).toBe('pending');
      expect(localStatuses.get('b1.pdf')).toBe('pending');
    });
  });

  describe('NEW algorithm (JobManager)', () => {
    it('all three jobs tracked and resolved', () => {
      const mgr = new JobManager();

      mgr.startJob({
        folder: { id: 'd-alpha', name: 'alpha', path: 'alpha/' },
        files: [{ id: 'f1', name: 'a1.pdf', path: 'alpha/a1.pdf' }],
        timeline: alphaTimeline,
      });

      mgr.startJob({
        folder: { id: 'd-beta', name: 'beta', path: 'beta/' },
        files: [
          { id: 'f2', name: 'b1.pdf', path: 'beta/b1.pdf' },
          { id: 'f3', name: 'b2.pdf', path: 'beta/b2.pdf' },
        ],
        timeline: betaTimeline,
      });

      // Single file gets its own "job" with path at root
      mgr.startJob({
        folder: { id: 'f4', name: 'readme.md', path: 'root-file/' },
        files: [{ id: 'f4', name: 'readme.md', path: 'readme.md' }],
        timeline: singleFileTimeline,
      });

      mgr.runUntilDone(10);
      expect(mgr.allResolved()).toBe(true);

      const statuses = mgr.getAllStatuses();
      expect(statuses.get('f1')).toBe('indexed');
      expect(statuses.get('f2')).toBe('indexed');
      expect(statuses.get('f3')).toBe('indexed');
      expect(statuses.get('f4')).toBe('indexed');
    });

    it('jobs resolve at different speeds', () => {
      const mgr = new JobManager();

      mgr.startJob({
        folder: { id: 'd-alpha', name: 'alpha', path: 'alpha/' },
        files: [{ id: 'f1', name: 'a1.pdf', path: 'alpha/a1.pdf' }],
        timeline: alphaTimeline,
      });

      mgr.startJob({
        folder: { id: 'd-beta', name: 'beta', path: 'beta/' },
        files: [
          { id: 'f2', name: 'b1.pdf', path: 'beta/b1.pdf' },
          { id: 'f3', name: 'b2.pdf', path: 'beta/b2.pdf' },
        ],
        timeline: betaTimeline,
      });

      // After tick 3: alpha done, beta not
      for (let i = 0; i < 4; i++) mgr.tick();
      expect(mgr.jobs.get('alpha/')!.resolved).toBe(true);
      expect(mgr.jobs.get('beta/')!.resolved).toBe(false);

      // After tick 4: both done
      mgr.tick();
      expect(mgr.jobs.get('beta/')!.resolved).toBe(true);
      expect(mgr.allResolved()).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO M: Deindex while indexing
//
// User starts indexing a folder, then deindexes one file mid-polling.
// The deindexed file should be removed from the job;
// remaining files should still resolve normally.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario M: deindex while indexing', () => {
  const timeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '2': [
      mkFile('f1', 'contracts/nda.pdf', 'pending'),
      mkFile('f2', 'contracts/agreement.pdf', 'pending'),
      mkFile('f3', 'contracts/addendum.pdf', 'pending'),
    ],
    '5': [
      mkFile('f1', 'contracts/nda.pdf', 'indexed'),
      mkFile('f2', 'contracts/agreement.pdf', 'indexed'),
      mkFile('f3', 'contracts/addendum.pdf', 'indexed'),
    ],
  };

  it('deindexed file removed from job, others continue', () => {
    const mgr = new JobManager();

    mgr.startJob({
      folder: { id: 'd-contracts', name: 'contracts', path: 'contracts/' },
      files: [
        { id: 'f1', name: 'nda.pdf', path: 'contracts/nda.pdf' },
        { id: 'f2', name: 'agreement.pdf', path: 'contracts/agreement.pdf' },
        { id: 'f3', name: 'addendum.pdf', path: 'contracts/addendum.pdf' },
      ],
      timeline,
    });

    // Tick 0..2 — files appear as pending
    mgr.tick(); mgr.tick(); mgr.tick();

    const job = mgr.jobs.get('contracts/')!;
    expect(job.files.get('f2')?.status).toBe('pending');

    // User deindexes agreement.pdf mid-polling
    const removed = mgr.removeFile('contracts/', 'f2');
    expect(removed).toBe(true);
    expect(job.files.has('f2')).toBe(false);
    expect(job.files.size).toBe(2); // f1 and f3 remain

    // Continue ticking — remaining files resolve
    mgr.runUntilDone(10);
    expect(job.files.get('f1')?.status).toBe('indexed');
    expect(job.files.get('f3')?.status).toBe('indexed');
    expect(job.folder.status).toBe('indexed');
    expect(job.resolved).toBe(true);
  });

  it('deindex all files → folder resolves as error', () => {
    const mgr = new JobManager();

    mgr.startJob({
      folder: { id: 'd-contracts', name: 'contracts', path: 'contracts/' },
      files: [
        { id: 'f1', name: 'nda.pdf', path: 'contracts/nda.pdf' },
      ],
      timeline,
    });

    mgr.tick(); // tick 0

    // Deindex the only file
    mgr.removeFile('contracts/', 'f1');

    const job = mgr.jobs.get('contracts/')!;
    expect(job.files.size).toBe(0);
    expect(job.folder.status).toBe('error'); // nothing to index
    expect(job.resolved).toBe(true);
  });

  it('deindex one file from a job with unprocessable files → correct resolution', () => {
    // 3 files: nda.pdf (processable), .DS_Store (unprocessable), addendum.pdf (processable)
    // User deindexes nda.pdf → only addendum.pdf tracked
    // .DS_Store will be 'error' (never appears), addendum indexed
    const mixedTimeline: Record<string, MockKBEntry[]> = {
      '0': [],
      '2': [mkFile('f3', 'contracts/addendum.pdf', 'pending')],
      '4': [mkFile('f3', 'contracts/addendum.pdf', 'indexed')],
      // .DS_Store never appears; nda.pdf removed by user
    };

    const mgr = new JobManager();

    mgr.startJob({
      folder: { id: 'd-contracts', name: 'contracts', path: 'contracts/' },
      files: [
        { id: 'f1', name: 'nda.pdf', path: 'contracts/nda.pdf' },
        { id: 'f-ds', name: '.DS_Store', path: 'contracts/.DS_Store' },
        { id: 'f3', name: 'addendum.pdf', path: 'contracts/addendum.pdf' },
      ],
      timeline: mixedTimeline,
      timeoutTick: 8,
    });

    // Deindex nda.pdf before any ticks
    mgr.removeFile('contracts/', 'f1');

    mgr.runUntilDone(10);

    const job = mgr.jobs.get('contracts/')!;
    expect(job.files.has('f1')).toBe(false); // removed
    expect(job.files.get('f-ds')?.status).toBe('error'); // unprocessable
    expect(job.files.get('f3')?.status).toBe('indexed');
    expect(job.folder.status).toBe('indexed'); // has indexed child
    expect(job.resolved).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO N: Empty-list infinite polling
//
// User indexes a folder, then navigates deeply before KB builds hierarchy.
// At the deep path, KB returns data=[] → current code polls every 1s forever.
// ISS-11 §3 Scenario E.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario N: empty-list infinite polling', () => {
  // KB at deep path returns empty until tick 5, then files appear
  const deepPathTimeline: Record<string, MockKBEntry[]> = {
    '0': [], // empty — KB hasn't built hierarchy yet
    '1': [], // still empty
    '2': [], // still empty
    '3': [], // still empty
    '5': [mkFile('f1', 'company/dept/team/report.pdf', 'pending')],
    '7': [mkFile('f1', 'company/dept/team/report.pdf', 'indexed')],
  };

  // Root timeline: directory appears eventually
  const rootTimeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '1': [mkDir('STACK_VFS_VIRTUAL_DIRECTORY', 'company')],
  };

  describe('CURRENT logic (broken)', () => {
    it('polls forever when data=[] and no hasLocalPending guard', () => {
      // Simulate 10 ticks of polling at a deep path where data stays empty
      const pollLog: Array<number | false> = [];

      for (let tick = 0; tick < 10; tick++) {
        const kbData = getTickResponse(deepPathTimeline, tick);
        const decision = currentPollingDecision(kbData);
        pollLog.push(decision);
      }

      // Ticks 0-4: data=[] → polls every 1000ms (no guard!)
      // Even if nothing is being indexed at this path
      expect(pollLog[0]).toBe(1000); // empty → poll
      expect(pollLog[1]).toBe(1000); // empty → poll
      expect(pollLog[2]).toBe(1000); // empty → poll
      expect(pollLog[3]).toBe(1000); // empty → poll
      expect(pollLog[4]).toBe(1000); // empty → poll

      // Tick 5: file appears as pending → poll
      expect(pollLog[5]).toBe(1000);
      // Tick 7: indexed → stop... but in reality user may have navigated
      // to a path that NEVER gets files → polls forever
    });

    it('polls forever on path that never gets KB resources', () => {
      // Navigate to an unrelated deep path → KB will never have resources here
      const emptyForever: Record<string, MockKBEntry[]> = { '0': [] };
      const pollLog: Array<number | false> = [];

      for (let tick = 0; tick < 20; tick++) {
        const kbData = getTickResponse(emptyForever, tick);
        pollLog.push(currentPollingDecision(kbData));
      }

      // ALL 20 ticks: data=[] → 1000 (polls forever)
      expect(pollLog.every((d) => d === 1000)).toBe(true);
    });
  });

  describe('NEW logic (with hasLocalPending guard)', () => {
    it('stops polling when data=[] and nothing pending locally', () => {
      const emptyForever: Record<string, MockKBEntry[]> = { '0': [] };
      const pollLog: Array<number | false> = [];

      for (let tick = 0; tick < 10; tick++) {
        const kbData = getTickResponse(emptyForever, tick);
        // hasLocalPending=false → no job tracking anything here
        pollLog.push(newPollingDecision(kbData, false));
      }

      // ALL ticks: data=[] + no pending → stop immediately
      expect(pollLog.every((d) => d === false)).toBe(true);
    });

    it('keeps polling when data=[] but files are pending locally', () => {
      const pollLog: Array<number | false> = [];

      for (let tick = 0; tick < 6; tick++) {
        const kbData = getTickResponse(deepPathTimeline, tick);
        // hasLocalPending=true → we submitted files, KB is building
        pollLog.push(newPollingDecision(kbData, true));
      }

      // Ticks 0-4: data=[] + pending → keep polling (KB building hierarchy)
      expect(pollLog[0]).toBe(1000);
      expect(pollLog[4]).toBe(1000);

      // Tick 5: files appear → 1000 (still pending)
      expect(pollLog[5]).toBe(1000);
    });

    it('stops polling when all indexed', () => {
      const pollLog: Array<number | false> = [];

      for (let tick = 0; tick < 10; tick++) {
        const kbData = getTickResponse(deepPathTimeline, tick);
        pollLog.push(newPollingDecision(kbData, true));
      }

      // Tick 7+: all indexed → stop
      expect(pollLog[7]).toBe(false);
    });

    it('hasLocalPending transitions to false after jobs resolve → stops polling', () => {
      // Simulates: job resolves → hasLocalPending becomes false → empty list stops
      const mgr = new JobManager();
      mgr.startJob({
        folder: { id: 'd-team', name: 'team', path: 'company/dept/team/' },
        files: [{ id: 'f1', name: 'report.pdf', path: 'company/dept/team/report.pdf' }],
        timeline: deepPathTimeline,
      });

      mgr.runUntilDone(10);
      expect(mgr.allResolved()).toBe(true);

      // After resolution, hasLocalPending = false
      // At root, data=[] → new polling decision: stop
      const rootData = getTickResponse(rootTimeline, 8);
      // Root has a directory, not empty — but let's check the deep unrelated path
      const unrelatedData: MockKBEntry[] = []; // empty path
      expect(newPollingDecision(unrelatedData, false)).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO O: Async gap — kbDoneIndexing fires during fetchFolderChildren
//
// Timeline:
//   1. User already indexed folder1 → it resolved → kbDoneIndexing=true
//   2. User clicks "Index" on folder2 → handleIndex starts
//   3. isPendingIndex = true (before await)
//   4. await fetchFolderChildren(folder2) — takes time
//   5. During step 4, React effect runs: kbDoneIndexing=true, submittedIds.size>0
//      Without isPendingIndex guard → clearSubmittedIds() fires!
//   6. fetchFolderChildren returns → mutation fires → adds to submittedIds
//      But if step 5 already cleared, we lost the first batch.
//
// CURRENT bug: no isPendingIndex guard → premature clear.
// NEW algorithm: isPendingIndex blocks the effect.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario O: async gap (kbDoneIndexing during fetchFolderChildren)', () => {
  /**
   * Simulates the kbDoneIndexing effect.
   * Returns true if effect would fire (clear submittedIds).
   */
  function wouldClearCurrentLogic(
    kbDoneIndexing: boolean,
    submittedIdsSize: number,
    isMutationPending: boolean,
  ): boolean {
    // Current code has NO isPendingIndex guard
    return kbDoneIndexing && submittedIdsSize > 0 && !isMutationPending;
  }

  function wouldClearNewLogic(
    kbDoneIndexing: boolean,
    submittedIdsSize: number,
    isMutationPending: boolean,
    isPendingIndex: boolean,
  ): boolean {
    // NEW: isPendingIndex blocks clearing during fetchFolderChildren await
    return kbDoneIndexing && submittedIdsSize > 0 && !isMutationPending && !isPendingIndex;
  }

  describe('CURRENT logic (broken)', () => {
    it('clears submittedIds prematurely during fetchFolderChildren', () => {
      // Step 1: folder1 was indexed and resolved
      const submittedIds = new Set(['f1', 'f2']); // folder1's files
      const kbDoneIndexing = true; // folder1 fully indexed on server

      // Step 2: user clicks Index on folder2
      // handleIndex starts → await fetchFolderChildren(folder2)
      // Mutation hasn't fired yet → isMutationPending = false

      // Step 5: React effect runs during the await gap
      const shouldClear = wouldClearCurrentLogic(
        kbDoneIndexing,
        submittedIds.size,
        false, // mutation not started yet (still awaiting fetchFolderChildren)
      );

      // BUG: effect fires and clears submittedIds!
      expect(shouldClear).toBe(true);

      // If we obey the effect:
      submittedIds.clear();

      // Step 6: fetchFolderChildren returns, mutation fires
      // handleIndex adds folder2's files
      submittedIds.add('f3');
      submittedIds.add('f4');

      // But folder1's files (f1, f2) are GONE from tracking.
      // If folder1 had a file that server skipped (.DS_Store),
      // there's no way to know it was submitted.
      expect(submittedIds.has('f1')).toBe(false); // lost!
      expect(submittedIds.has('f2')).toBe(false); // lost!
    });
  });

  describe('NEW logic (with isPendingIndex guard)', () => {
    it('does NOT clear during fetchFolderChildren await', () => {
      const submittedIds = new Set(['f1', 'f2']);
      const kbDoneIndexing = true;

      // Step 2: handleIndex starts → sets isPendingIndex = true
      const isPendingIndex = true;

      // Step 5: React effect runs during await
      const shouldClear = wouldClearNewLogic(
        kbDoneIndexing,
        submittedIds.size,
        false, // mutation not started
        isPendingIndex, // ← GUARD: blocks premature clear
      );

      expect(shouldClear).toBe(false); // effect blocked!
      expect(submittedIds.size).toBe(2); // folder1's files preserved
    });

    it('clears normally after mutation completes', () => {
      const submittedIds = new Set(['f1', 'f2', 'f3', 'f4']);
      const kbDoneIndexing = true;

      // Mutation completed → isPendingIndex reset to false
      const isPendingIndex = false;

      const shouldClear = wouldClearNewLogic(
        kbDoneIndexing,
        submittedIds.size,
        false, // mutation done
        isPendingIndex,
      );

      expect(shouldClear).toBe(true); // safe to clear now
    });

    it('full lifecycle: index folder1, resolve, index folder2, resolve', () => {
      const submittedIds = new Set<string>();
      let isPendingIndex = false;
      let kbDoneIndexing = false;

      // === Phase 1: index folder1 ===
      // handleIndex(folder1) start
      isPendingIndex = true;
      // fetchFolderChildren returns
      submittedIds.add('f1');
      submittedIds.add('f2');
      // mutation fires
      isPendingIndex = false;

      // KB processes folder1
      kbDoneIndexing = true;
      // Effect fires: safe (isPendingIndex=false, mutation done)
      expect(wouldClearNewLogic(kbDoneIndexing, submittedIds.size, false, isPendingIndex)).toBe(true);
      submittedIds.clear();

      // === Phase 2: index folder2 (while kbDoneIndexing still true from KB cache) ===
      // handleIndex(folder2) start
      isPendingIndex = true;
      // During fetchFolderChildren, kbDoneIndexing could be true (cached)
      // Effect tries to fire but isPendingIndex blocks it
      expect(wouldClearNewLogic(kbDoneIndexing, submittedIds.size, false, isPendingIndex)).toBe(false);
      // submittedIds.size = 0 here anyway, but test the guard

      // fetchFolderChildren returns, add files
      submittedIds.add('f3');
      submittedIds.add('f4');

      // Check: still guarded
      expect(wouldClearNewLogic(kbDoneIndexing, submittedIds.size, false, isPendingIndex)).toBe(false);

      // mutation completes
      isPendingIndex = false;

      // KB needs to re-process → kbDoneIndexing goes false first
      kbDoneIndexing = false;
      expect(wouldClearNewLogic(kbDoneIndexing, submittedIds.size, false, isPendingIndex)).toBe(false);

      // KB finishes folder2
      kbDoneIndexing = true;
      expect(wouldClearNewLogic(kbDoneIndexing, submittedIds.size, false, isPendingIndex)).toBe(true);
      submittedIds.clear();
      expect(submittedIds.size).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO P: alreadyIndexed collision
//
// User is viewing folderA which contains:
//   - file.pdf (already indexed)
//   - folderB (subfolder)
// folderB also contains:
//   - file.pdf (not indexed)
//
// User clicks "Index" on folderB.
// kbResources (scoped to folderA) → alreadyIndexed = [{name:'file.pdf', status:'indexed'}]
// children from folderB → [{name:'file.pdf'}]
//
// CURRENT bug: localStatuses['file.pdf'] set to 'pending' by children loop,
//   then overwritten to 'indexed' by alreadyIndexed loop.
//   After navigation into folderB, localStatuses['file.pdf'] = 'indexed'
//   masks the real server status (pending or null).
//
// NEW algorithm: uses resourceId, not name → no collision.
// ISS-11 §2.2: localStatuses: Map<name, status> marks ALL children as 'pending'
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario P: alreadyIndexed name collision across folders', () => {
  // --- Setup: two file.pdfs in different folders ---
  const folderA_filePdf = {
    id: 'folderA-file-pdf',
    name: 'file.pdf',
    type: 'file' as const,
    status: 'indexed' as string | null,
    parentPath: '/',
  };

  const folderB = {
    id: 'folderB-id',
    name: 'folderB',
    type: 'folder' as const,
    status: null as string | null,
    parentPath: '/',
  };

  const folderB_filePdf = {
    id: 'folderB-file-pdf',
    name: 'file.pdf',
    type: 'file' as const,
    status: null as string | null,
    parentPath: '/folderB',
  };

  const folderB_notes = {
    id: 'folderB-notes',
    name: 'notes.txt',
    type: 'file' as const,
    status: null as string | null,
    parentPath: '/folderB',
  };

  // KB timeline for folderB sub-path
  const folderBTimeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '2': [
      mkFile('folderB-file-pdf', 'folderB/file.pdf', 'pending'),
      mkFile('folderB-notes', 'folderB/notes.txt', 'pending'),
    ],
    '4': [
      mkFile('folderB-file-pdf', 'folderB/file.pdf', 'indexed'),
      mkFile('folderB-notes', 'folderB/notes.txt', 'indexed'),
    ],
  };

  describe('CURRENT logic (broken)', () => {
    it('alreadyIndexed overwrites pending children with same name', () => {
      // Simulate handleIndex(folderB) while viewing folderA
      // Step 1: build localStatuses
      const localStatuses = new Map<string, string>();

      // children.forEach(c => next.set(c.name, 'pending'))
      localStatuses.set('file.pdf', 'pending');   // folderB's file
      localStatuses.set('notes.txt', 'pending');   // folderB's notes

      // alreadyIndexed.forEach(r => next.set(r.name, 'indexed'))
      // alreadyIndexed = kbResources.filter(indexed/pending && != folderB)
      // kbResources at folderA level contains file.pdf with 'indexed'
      localStatuses.set('file.pdf', 'indexed');  // ← BUG: overwrites folderB's pending

      // file.pdf now shows 'indexed' even though folderB's file.pdf hasn't been processed
      expect(localStatuses.get('file.pdf')).toBe('indexed'); // wrong!
      expect(localStatuses.get('notes.txt')).toBe('pending'); // correct (no collision)
    });

    it('stale indexed status follows user into folderB after navigation', () => {
      const localStatuses = new Map<string, string>();
      localStatuses.set('file.pdf', 'indexed'); // stale from alreadyIndexed overwrite
      localStatuses.set('notes.txt', 'pending');

      // User navigates into folderB
      // connectionResources at /folderB: file.pdf (null), notes.txt (null)
      // kbResources at /folderB path: initially empty, then pending, then indexed
      // But localStatuses still has file.pdf = 'indexed'

      // Tick 0: KB hasn't built folderB yet
      const connectionResources = [folderB_filePdf, folderB_notes];

      // Merge at tick 0 (KB empty, no server status)
      const mergedStatuses = new Map<string, string>();
      for (const cr of connectionResources) {
        const serverStatus = cr.status; // null for both
        const localStatus = localStatuses.get(cr.name);
        const merged =
          localStatus !== undefined &&
          statusPriority(localStatus) > statusPriority(serverStatus)
            ? localStatus
            : serverStatus;
        mergedStatuses.set(cr.id, merged ?? 'null');
      }

      // file.pdf shows 'indexed' (WRONG — server hasn't confirmed folderB's file yet)
      expect(mergedStatuses.get('folderB-file-pdf')).toBe('indexed');
      // notes.txt shows 'pending' (correct — no collision)
      expect(mergedStatuses.get('folderB-notes')).toBe('pending');
    });

    it('masks real server progress — pending never shown', () => {
      const localStatuses = new Map<string, string>();
      localStatuses.set('file.pdf', 'indexed'); // stale
      localStatuses.set('notes.txt', 'pending');

      const connectionResources = [folderB_filePdf, folderB_notes];

      // Tick 2: server has file.pdf as 'pending' — real progress!
      const kbData = getTickResponse(folderBTimeline, 2);
      const kbStatusById = new Map(kbData.map((r) => [r.resource_id, r.status]));
      const kbStatusByName = new Map(
        kbData.map((r) => [extractName(r.inode_path.path), r.status]),
      );

      const mergedStatuses = new Map<string, string>();
      for (const cr of connectionResources) {
        const serverStatus =
          kbStatusById.get(cr.id) ?? kbStatusByName.get(cr.name) ?? cr.status;
        const localStatus = localStatuses.get(cr.name);
        const merged =
          localStatus !== undefined &&
          statusPriority(localStatus) > statusPriority(serverStatus)
            ? localStatus
            : serverStatus;
        mergedStatuses.set(cr.id, merged ?? 'null');
      }

      // file.pdf: server='pending', local='indexed' → statusPriority(indexed=3) > pending(2)
      // → shows 'indexed'. User NEVER sees the pending→indexed transition.
      expect(mergedStatuses.get('folderB-file-pdf')).toBe('indexed'); // masks progress
      expect(mergedStatuses.get('folderB-notes')).toBe('pending');
    });

    it('polling never terminates because localStatuses is never cleared', () => {
      const localStatuses = new Map<string, string>();
      localStatuses.set('file.pdf', 'indexed'); // stale forever
      localStatuses.set('notes.txt', 'pending');  // stale forever

      // Even at tick 100, localStatuses has these entries
      // notes.txt will ALWAYS show 'pending' because localStatuses is never cleared
      // (no kbDoneIndexing effect in current code)
      const stillStale = localStatuses.get('notes.txt');
      expect(stillStale).toBe('pending'); // stuck forever
    });
  });

  describe('NEW logic (per-resourceId tracking)', () => {
    it('tracks files by resourceId — no collision between folders', () => {
      const nav = new NavigationSimulator();
      nav.addResources([folderA_filePdf, folderB, folderB_filePdf, folderB_notes]);

      const mgr = new JobManager();
      mgr.startJob({
        folder: { id: 'folderB-id', name: 'folderB', path: 'folderB/' },
        files: [
          { id: 'folderB-file-pdf', name: 'file.pdf', path: 'folderB/file.pdf' },
          { id: 'folderB-notes', name: 'notes.txt', path: 'folderB/notes.txt' },
        ],
        timeline: folderBTimeline,
      });

      // At root: folderA's file.pdf is indexed (from server), folderB's files are pending (from job)
      nav.navigate('/');
      const rootView = nav.getVisibleStatuses(mgr);
      // folderA's file.pdf: not in any job → shows server status 'indexed'
      expect(rootView.get('folderA-file-pdf')).toBe('indexed');
      // folderB: in job as folder → shows 'pending'
      expect(rootView.get('folderB-id')).toBe('pending');
    });

    it('shows correct pending status after navigating into folderB', () => {
      const nav = new NavigationSimulator();
      nav.addResources([folderA_filePdf, folderB, folderB_filePdf, folderB_notes]);

      const mgr = new JobManager();
      mgr.startJob({
        folder: { id: 'folderB-id', name: 'folderB', path: 'folderB/' },
        files: [
          { id: 'folderB-file-pdf', name: 'file.pdf', path: 'folderB/file.pdf' },
          { id: 'folderB-notes', name: 'notes.txt', path: 'folderB/notes.txt' },
        ],
        timeline: folderBTimeline,
      });

      // Navigate into folderB BEFORE any ticks
      nav.navigate('/folderB');
      const view = nav.getVisibleStatuses(mgr);

      // Both files show 'pending' from the job — no stale 'indexed'
      expect(view.get('folderB-file-pdf')).toBe('pending');
      expect(view.get('folderB-notes')).toBe('pending');
    });

    it('resolves to indexed after polling — guaranteed termination', () => {
      const mgr = new JobManager();
      mgr.startJob({
        folder: { id: 'folderB-id', name: 'folderB', path: 'folderB/' },
        files: [
          { id: 'folderB-file-pdf', name: 'file.pdf', path: 'folderB/file.pdf' },
          { id: 'folderB-notes', name: 'notes.txt', path: 'folderB/notes.txt' },
        ],
        timeline: folderBTimeline,
      });

      const ticks = mgr.runUntilDone(10);

      // Must finish
      expect(mgr.allResolved()).toBe(true);
      expect(ticks).toBeLessThanOrEqual(5); // indexed at tick 4

      // Both files indexed
      const statuses = mgr.getAllStatuses();
      expect(statuses.get('folderB-file-pdf')).toBe('indexed');
      expect(statuses.get('folderB-notes')).toBe('indexed');
      expect(statuses.get('folderB-id')).toBe('indexed'); // derived
    });

    it('folderA file.pdf status is independent of folderB job', () => {
      const nav = new NavigationSimulator();
      nav.addResources([folderA_filePdf, folderB, folderB_filePdf, folderB_notes]);

      const mgr = new JobManager();
      mgr.startJob({
        folder: { id: 'folderB-id', name: 'folderB', path: 'folderB/' },
        files: [
          { id: 'folderB-file-pdf', name: 'file.pdf', path: 'folderB/file.pdf' },
          { id: 'folderB-notes', name: 'notes.txt', path: 'folderB/notes.txt' },
        ],
        timeline: folderBTimeline,
      });

      // Run some ticks (files still pending)
      mgr.tick();
      mgr.tick();

      // Navigate to root — folderA's file.pdf should still be 'indexed' (untouched)
      nav.navigate('/');
      const rootView = nav.getVisibleStatuses(mgr);
      expect(rootView.get('folderA-file-pdf')).toBe('indexed');

      // Navigate to folderB — folderB's file.pdf should be 'pending' (from job)
      nav.navigate('/folderB');
      const folderBView = nav.getVisibleStatuses(mgr);
      expect(folderBView.get('folderB-file-pdf')).toBe('pending');

      // Two different files, same name, correct independent statuses
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO Q: Nested subfolders — status derivation from root
// ═══════════════════════════════════════════════════════════════════════════════
// User indexes /projects/ from root.
// fetchFolderChildren returns RECURSIVELY:
//   readme.pdf        (file)
//   docs/             (folder)
//   docs/guide.pdf    (file)
//   docs/.gitkeep     (file, unprocessable)
//
// handleIndex filters: newResources = children.filter(type==='file')
//   → [readme.pdf, docs/guide.pdf, docs/.gitkeep]
// All files get jobRootId = 'projects-id'
//
// Problem: getDisplayStatus('docs-folder-id') has no way to find
// children — they all have jobRootId='projects-id', not 'docs-folder-id'.
// The subfolder is never added to submittedIds.
// → UI shows "Not Indexed" for docs/ even though its children are pending.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario Q: subfolder status derivation', () => {
  // KB timeline at /projects (what useKBResources returns)
  const projectsTimeline: Record<string, MockKBEntry[]> = {
    '0': [],
    '1': [
      mkFile('f1', 'projects/readme.pdf', 'pending'),
      mkDir('STACK_VFS_VIRTUAL_DIRECTORY', 'projects/docs'),
      mkFile('f2', 'projects/docs/guide.pdf', 'pending'),
    ],
    '4': [
      mkFile('f1', 'projects/readme.pdf', 'indexed'),
      mkDir('STACK_VFS_VIRTUAL_DIRECTORY', 'projects/docs'),
      mkFile('f2', 'projects/docs/guide.pdf', 'indexed'),
      // .gitkeep never appears (skipped by server)
    ],
  };

  // What fetchFolderChildren returns (RECURSIVE — all levels):
  const fetchedChildren = [
    { id: 'f1', name: 'readme.pdf', type: 'file' as const, path: 'projects/readme.pdf' },
    { id: 'docs-folder-id', name: 'docs', type: 'folder' as const, path: 'projects/docs/' },
    { id: 'f2', name: 'guide.pdf', type: 'file' as const, path: 'projects/docs/guide.pdf' },
    { id: 'f3', name: '.gitkeep', type: 'file' as const, path: 'projects/docs/.gitkeep' },
  ];

  // Connection resources visible when navigating INTO /projects/
  const projectsConnectionResources: ConnectionResource[] = [
    { id: 'f1', name: 'readme.pdf', type: 'file', status: null, parentPath: '/projects' },
    { id: 'docs-folder-id', name: 'docs', type: 'folder', status: null, parentPath: '/projects' },
  ];

  describe('CURRENT logic (broken) — subfolders dropped from tracking', () => {
    it('only files are added to submittedIds — subfolders dropped', () => {
      // handleIndex: newResources = children.filter(c => c.type === 'file')
      const newResources = fetchedChildren.filter((c) => c.type === 'file');
      expect(newResources.map((r) => r.name)).toEqual(['readme.pdf', 'guide.pdf', '.gitkeep']);
      // docs/ subfolder is dropped!
      expect(newResources.find((r) => r.name === 'docs')).toBeUndefined();
    });

    it('getDisplayStatus returns null for untracked subfolder', () => {
      // Simulate submittedIds after handleIndex (only files, jobRootId = root)
      const submittedIds = new Map<string, { name: string; status: string; jobRootId: string }>();
      const files = fetchedChildren.filter((c) => c.type === 'file');
      for (const f of files) {
        submittedIds.set(f.id, { name: f.name, status: 'pending', jobRootId: 'projects-id' });
      }

      // getDisplayStatus('docs-folder-id'):
      // 1. Direct lookup → NOT found
      const directEntry = submittedIds.get('docs-folder-id');
      expect(directEntry).toBeUndefined();

      // 2. Derivation: children with jobRootId === 'docs-folder-id'
      const children = [...submittedIds.values()].filter(
        (e) => e.jobRootId === 'docs-folder-id',
      );
      expect(children.length).toBe(0); // all have jobRootId='projects-id'

      // → returns null → UI shows "Not Indexed" ✗
    });

    it('subfolder shows "Not Indexed" even after children are indexed', () => {
      const submittedIds = new Map<string, { name: string; status: string; jobRootId: string }>();
      const files = fetchedChildren.filter((c) => c.type === 'file');
      for (const f of files) {
        submittedIds.set(f.id, { name: f.name, status: 'indexed', jobRootId: 'projects-id' });
      }

      // docs/ is still not tracked — even with all children indexed
      const directEntry = submittedIds.get('docs-folder-id');
      expect(directEntry).toBeUndefined();

      const children = [...submittedIds.values()].filter(
        (e) => e.jobRootId === 'docs-folder-id',
      );
      expect(children.length).toBe(0);
      // → null → "Not Indexed" while sibling files show "Indexed" — inconsistent
    });
  });

  describe('NEW logic — subfolders tracked in submittedIds', () => {
    /**
     * Fix: handleIndex should add subfolder entries too:
     *   submittedIds.set('docs-folder-id', { name:'docs', status:'pending',
     *     jobRootId:'projects-id', type:'folder' })
     *
     * getDisplayStatus('docs-folder-id'):
     *   1. Direct entry found with type='folder'
     *   2. Derive from FILES in submittedIds whose path starts with this folder's path
     *      (or by tracking parentFolderId)
     */
    function buildSubmittedIds(
      children: typeof fetchedChildren,
      rootId: string,
    ): Map<string, { name: string; status: string; jobRootId: string; type: 'file' | 'folder'; path: string }> {
      const map = new Map<
        string,
        { name: string; status: string; jobRootId: string; type: 'file' | 'folder'; path: string }
      >();
      for (const c of children) {
        map.set(c.id, {
          name: c.name,
          status: 'pending',
          jobRootId: rootId,
          type: c.type,
          path: c.path,
        });
      }
      return map;
    }

    /** Derive folder status: look at files whose path starts with this folder's path */
    function getDisplayStatusFixed(
      resourceId: string,
      submittedIds: ReturnType<typeof buildSubmittedIds>,
    ): string | null {
      const entry = submittedIds.get(resourceId);

      if (entry && entry.type === 'file') {
        return entry.status;
      }

      if (entry && entry.type === 'folder') {
        // Find all FILE entries under this folder
        const folderPath = entry.path.endsWith('/') ? entry.path : entry.path + '/';
        const fileChildren = [...submittedIds.values()].filter(
          (e) => e.type === 'file' && e.path.startsWith(folderPath),
        );
        if (fileChildren.length === 0) return 'pending'; // no children yet
        const statuses = fileChildren.map((e) => e.status);
        if (statuses.some((s) => s === 'pending')) return 'pending';
        if (statuses.some((s) => s === 'indexed')) return 'indexed';
        return 'error';
      }

      // Root folder: derive from ALL children with jobRootId === resourceId
      const children = [...submittedIds.values()].filter(
        (e) => e.jobRootId === resourceId && e.type === 'file',
      );
      if (children.length === 0) return null;
      const statuses = children.map((e) => e.status);
      if (statuses.some((s) => s === 'pending')) return 'pending';
      if (statuses.some((s) => s === 'indexed')) return 'indexed';
      return 'error';
    }

    it('subfolder shows pending when children are pending', () => {
      const submittedIds = buildSubmittedIds(fetchedChildren, 'projects-id');

      const docsStatus = getDisplayStatusFixed('docs-folder-id', submittedIds);
      expect(docsStatus).toBe('pending');
    });

    it('subfolder shows indexed when all children under it are indexed', () => {
      const submittedIds = buildSubmittedIds(fetchedChildren, 'projects-id');
      // Resolve guide.pdf as indexed, .gitkeep as error (skipped)
      const guide = submittedIds.get('f2')!;
      submittedIds.set('f2', { ...guide, status: 'indexed' });
      const gitkeep = submittedIds.get('f3')!;
      submittedIds.set('f3', { ...gitkeep, status: 'error' });

      const docsStatus = getDisplayStatusFixed('docs-folder-id', submittedIds);
      expect(docsStatus).toBe('indexed'); // has at least one indexed child
    });

    it('subfolder shows error when ALL children under it errored', () => {
      const submittedIds = buildSubmittedIds(fetchedChildren, 'projects-id');
      const guide = submittedIds.get('f2')!;
      submittedIds.set('f2', { ...guide, status: 'error' });
      const gitkeep = submittedIds.get('f3')!;
      submittedIds.set('f3', { ...gitkeep, status: 'error' });

      const docsStatus = getDisplayStatusFixed('docs-folder-id', submittedIds);
      expect(docsStatus).toBe('error');
    });

    it('root folder status still derives from jobRootId (unchanged)', () => {
      const submittedIds = buildSubmittedIds(fetchedChildren, 'projects-id');

      // Root folder (projects/) is NOT in submittedIds — its pseudo-entry was deleted
      const rootStatus = getDisplayStatusFixed('projects-id', submittedIds);
      // Falls through to jobRootId derivation — finds ALL file children
      expect(rootStatus).toBe('pending');

      // After all resolve:
      for (const [id, entry] of submittedIds) {
        if (entry.type === 'file') {
          submittedIds.set(id, { ...entry, status: 'indexed' });
        }
      }

      const rootStatusAfter = getDisplayStatusFixed('projects-id', submittedIds);
      expect(rootStatusAfter).toBe('indexed');
    });

    it('resolveFromKBData skips folder entries correctly', () => {
      const submittedIds = buildSubmittedIds(fetchedChildren, 'projects-id');

      // Simulate KB poll data at tick 4 (all indexed)
      const kbData = getTickResponse(projectsTimeline, 4);
      const kbFiles = kbData.filter((r) => r.inode_type === 'file');

      // resolveFromKBData only processes pending file entries
      for (const [id, entry] of submittedIds) {
        if (entry.type === 'folder') continue; // skip folder entries
        if (entry.status !== 'pending') continue;

        const kbEntry = kbFiles.find(
          (r) => r.resource_id === id || extractName(r.inode_path.path) === entry.name,
        );
        if (kbEntry?.status === 'indexed') {
          submittedIds.set(id, { ...entry, status: 'indexed' });
        }
      }

      // guide.pdf resolved, .gitkeep not found in KB (skipped)
      expect(submittedIds.get('f1')!.status).toBe('indexed');
      expect(submittedIds.get('f2')!.status).toBe('indexed');
      expect(submittedIds.get('f3')!.status).toBe('pending'); // not yet error (needs allKBFilesIndexed rule)

      // docs/ folder entry untouched by resolveFromKBData
      expect(submittedIds.get('docs-folder-id')!.type).toBe('folder');
      expect(submittedIds.get('docs-folder-id')!.status).toBe('pending'); // original, not modified
    });
  });
});
