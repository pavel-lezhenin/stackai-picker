/**
 * @file IndexingEngine.ts — Pure indexing state machine.
 *
 * ── Architecture exception ──────────────────────────────────────────────
 * This file intentionally deviates from project conventions:
 *
 *  1. PascalCase filename — exports a class, not a utility function.
 *  2. Class instead of plain functions — the engine is a stateful machine
 *     with ~10 tightly-coupled transitions sharing private state (_entries,
 *     _deindexedIds, _mutationSeq). A class keeps invariants co-located
 *     and prevents accidental misuse vs a bag of functions + a mutable object.
 *  3. >250 lines (~340) — splitting the state machine across files would
 *     scatter transitions that must be understood together (markPending →
 *     expandFolder → resolveFromKBData → deindex). 69 unit tests validate
 *     correctness as a single unit.
 *  4. Co-located types (FolderChild, SubmissionPlan) and utilities
 *     (isKBDone, getFileDescendants) — used exclusively by this engine
 *     and its tests. Moving them adds indirection with no consumer benefit.
 *  5. INDEXING_TIMEOUT_MS defined here, not in constants.ts — it is an
 *     engine-internal knob used only by getDisplayStatus/resolveTimeouts.
 *
 * Reviewed: 2026-03-07. Revisit if the engine is split or consumers multiply.
 * ────────────────────────────────────────────────────────────────────────
 */

import type { Resource, ResourceStatus, ResourceType, SubmittedEntry } from '@/types/resource';

/** KB API terminal success statuses — 'parsed' is the real status, 'indexed' for compatibility. */
export function isKBDone(status: ResourceStatus): boolean {
  return status === 'indexed' || status === 'parsed';
}

/** After this duration, pending files that the server never confirmed are marked 'error'. */
export const INDEXING_TIMEOUT_MS = 60 * 1000; // 1 minute

/** Recursively collects all file descendants under a folder by walking parentId links. */
export function getFileDescendants(
  folderId: string,
  entries: ReadonlyMap<string, SubmittedEntry>,
): SubmittedEntry[] {
  const result: SubmittedEntry[] = [];
  for (const [id, entry] of entries) {
    if (id === folderId) continue;
    if (entry.parentId !== folderId) continue;
    if (entry.type === 'file') {
      result.push(entry);
    } else if (entry.type === 'folder') {
      result.push(...getFileDescendants(id, entries));
    }
  }
  return result;
}

// ─── Folder child descriptor (returned by the async folder resolver) ─────────

export type FolderChild = {
  resourceId: string;
  name: string;
  type: ResourceType;
  parentId: string;
};

// ─── Submit result from prepareSubmission ────────────────────────────────────

export type SubmissionPlan = {
  /** All new file Resources to send to the server (excludes already-indexed). */
  newFiles: Resource[];
  /** All resources to send to server (newFiles + alreadyIndexed). */
  allResources: Resource[];
  /**
   * Per-folder children map.
   * Key = folder resourceId, Value = children (files & subfolders with parentId).
   */
  folderChildren: Map<string, FolderChild[]>;
  /** Folder names that were empty (for toast messages). */
  emptyFolderNames: string[];
};

/**
 * Pure, synchronous indexing state machine.
 *
 * Holds `submittedIds` + `allSubmittedResources` and exposes
 * deterministic transition functions. No React, no async, no side effects.
 *
 * The React hook (`useIndexing`) wraps this engine:
 *   - calls `engine.markPending(resources)` on user click
 *   - calls `engine.expandFolders(folderId, children)` after async fetch
 *   - calls `engine.resolveFromKBData(kbResources)` on poll tick
 *   - reads `engine.getDisplayStatus(id)` for rendering
 */
export class IndexingEngine {
  /** Tracked entries keyed by resourceId. */
  private _entries: Map<string, SubmittedEntry> = new Map();

  /** Accumulated file Resources for dedup across rapid-fire mutations. */
  private _allSubmittedResources: Map<string, Resource> = new Map();

  /** IDs that were deindexed — prevents stale KB cache from overriding status. */
  private _deindexedIds: Set<string> = new Set();

  /** Latest kbId from mutations. */
  private _kbId: string | undefined = undefined;

  /** Monotonic counter — only the highest seq wins setKbId. */
  private _mutationSeq = 0;

  /** Overridable clock for deterministic testing. */
  now: () => number = () => Date.now();

  // ─── Read-only accessors ──────────────────────────────────────────────

  get entries(): ReadonlyMap<string, SubmittedEntry> {
    return this._entries;
  }

  get allSubmittedResources(): ReadonlyMap<string, Resource> {
    return this._allSubmittedResources;
  }

  get kbId(): string | undefined {
    return this._kbId;
  }

  get mutationSeq(): number {
    return this._mutationSeq;
  }

  get deindexedIds(): ReadonlySet<string> {
    return this._deindexedIds;
  }

  get hasActiveJobs(): boolean {
    for (const e of this._entries.values()) {
      if (e.status === 'pending') return true;
    }
    return false;
  }

  // ─── Snapshot / restore (for React setState immutability) ─────────────

  /** Returns a shallow clone of entries (for React state diffing). */
  snapshot(): Map<string, SubmittedEntry> {
    return new Map(this._entries);
  }

  // ─── State transitions ────────────────────────────────────────────────

  /**
   * Mark resources as pending. Called immediately on user click.
   * Folders get a pseudo-entry that will later be expanded.
   */
  markPending(resources: Resource[], timestamp?: number): void {
    const now = timestamp ?? this.now();
    for (const r of resources) {
      this._deindexedIds.delete(r.resourceId);
      this._entries.set(r.resourceId, {
        name: r.name,
        type: r.type === 'folder' ? 'folder' : 'file',
        parentId: r.resourceId,
        status: 'pending',
        jobRootId: r.resourceId,
        submittedAt: now,
      });
    }
  }

  /**
   * Replace folder pseudo-entry with actual children.
   * Called after async fetchFolderChildren resolves.
   */
  expandFolder(folderId: string, children: FolderChild[], timestamp?: number): void {
    const now = timestamp ?? this._entries.get(folderId)?.submittedAt ?? this.now();
    this._entries.delete(folderId);
    for (const child of children) {
      this._entries.set(child.resourceId, {
        name: child.name,
        type: child.type,
        parentId: child.parentId,
        status: 'pending',
        jobRootId: folderId,
        submittedAt: now,
      });
    }
  }

  /** Remove a submitted entry (e.g. empty folder cleanup or mutation failure). */
  removeEntries(resourceIds: string[]): void {
    for (const id of resourceIds) {
      this._entries.delete(id);
    }
  }

  /** Track file resources for future dedup across rapid-fire mutations. */
  trackSubmittedFiles(files: Resource[]): void {
    for (const r of files) {
      this._allSubmittedResources.set(r.resourceId, r);
    }
  }

  /** Increment and return new mutation sequence number. */
  nextMutationSeq(): number {
    return ++this._mutationSeq;
  }

  /** Conditionally set kbId only if seq matches current (race resolution). */
  setKbIdIfLatest(seq: number, kbId: string): void {
    if (seq === this._mutationSeq) {
      this._kbId = kbId;
    }
  }

  // ─── Deindex ──────────────────────────────────────────────────────────

  /** Remove a resource (file or folder) from tracking. For folders, also removes all children with matching jobRootId. */
  deindex(resourceId: string): void {
    this._entries.delete(resourceId);
    this._allSubmittedResources.delete(resourceId);
    this._deindexedIds.add(resourceId);

    // Intentional: deleting from a Map during for..of is safe per ES2015 spec.
    // All children share the same jobRootId (set to the folder root at submission),
    // so this single pass catches every descendant regardless of nesting depth.
    for (const [id, entry] of this._entries) {
      if (entry.jobRootId === resourceId) {
        this._entries.delete(id);
        this._allSubmittedResources.delete(id);
        this._deindexedIds.add(id);
      }
    }
  }

  // ─── Query functions ──────────────────────────────────────────────────

  /**
   * Returns the display status for a resource based on submitted tracking.
   * - Files: direct lookup by resourceId
   * - Subfolder: derived from children via parentId links
   * - Root folder: derived from children via jobRootId
   * - Unknown: returns null
   */
  getDisplayStatus(resourceId: string, timestamp?: number): ResourceStatus {
    const now = timestamp ?? this.now();
    const entry = this._entries.get(resourceId);

    // File: direct lookup
    if (entry && entry.type === 'file') {
      if (entry.status === 'pending' && now - entry.submittedAt > INDEXING_TIMEOUT_MS) {
        return 'error';
      }
      return entry.status;
    }

    // Subfolder within a job: derive from file entries whose parentId matches
    if (entry && entry.type === 'folder') {
      const fileDescendants = getFileDescendants(resourceId, this._entries);
      const statuses = fileDescendants.map((e) => {
        if (e.status === 'pending' && now - e.submittedAt > INDEXING_TIMEOUT_MS) return 'error';
        return e.status;
      });
      if (fileDescendants.length === 0) return 'pending';
      if (statuses.some((s) => s === 'pending')) return 'pending';
      if (statuses.some((s) => isKBDone(s))) return 'indexed';
      return 'error';
    }

    // Root folder (pseudo-entry was expanded and deleted): derive from jobRootId children
    const children: SubmittedEntry[] = [];
    for (const e of this._entries.values()) {
      if (e.jobRootId === resourceId && e.type === 'file') {
        children.push(e);
      }
    }
    if (children.length === 0) return null;

    const statuses = children.map((e) => {
      if (e.status === 'pending' && now - e.submittedAt > INDEXING_TIMEOUT_MS) return 'error';
      return e.status;
    });
    if (statuses.some((s) => s === 'pending')) return 'pending';
    if (statuses.some((s) => isKBDone(s))) return 'indexed';
    return 'error';
  }

  // ─── Resolution from KB poll data ─────────────────────────────────────

  /**
   * Updates submitted entries from KB resources (poll data).
   * Returns true if anything changed.
   *
   * Rules:
   *   1. Server confirmed done (by id or name) → mark indexed
   *   2. All KB files done + file absent + job sibling in KB → mark error
   *   3. Timeout → mark error
   */
  resolveFromKBData(kbResources: Resource[], timestamp?: number): boolean {
    const kbFiles = kbResources.filter((r) => r.type === 'file');
    if (kbFiles.length === 0 && this._entries.size === 0) return false;

    const kbStatusById = new Map(kbFiles.map((r) => [r.resourceId, r.status]));
    const kbStatusByName = new Map(kbFiles.map((r) => [r.name, r.status]));
    const allKBFilesIndexed = kbFiles.length > 0 && kbFiles.every((r) => isKBDone(r.status));
    const now = timestamp ?? this.now();

    let changed = false;

    for (const [id, entry] of this._entries) {
      if (entry.type === 'folder') continue;
      if (entry.status !== 'pending') continue;

      // Rule 1: server confirmed done (by ID or name)
      const kbStatus = kbStatusById.get(id) ?? kbStatusByName.get(entry.name);
      if (kbStatus && isKBDone(kbStatus)) {
        this._entries.set(id, { ...entry, status: 'indexed' });
        changed = true;
        continue;
      }

      // Rule 2: server finished our job but skipped this file.
      // Conditions (ALL must be true):
      //   a) All KB files are done (no pending server-side)
      //   b) This file is absent from KB
      //   c) At least one sibling from the SAME job is in KB (proves server saw this batch)
      //   d) ALL pending siblings from this job are accounted for in KB
      //      (if any sibling is also absent, the server may still be processing)
      const jobSiblingInKB = this._hasJobSiblingInKB(id, entry, kbStatusById, kbStatusByName);
      const allJobSiblingsInKB = this._allJobSiblingsInKB(id, entry, kbStatusById, kbStatusByName);
      if (
        allKBFilesIndexed &&
        jobSiblingInKB &&
        allJobSiblingsInKB &&
        !kbStatusById.has(id) &&
        !kbStatusByName.has(entry.name)
      ) {
        this._entries.set(id, { ...entry, status: 'error' });
        changed = true;
        continue;
      }

      // Rule 3: timeout
      if (now - entry.submittedAt > INDEXING_TIMEOUT_MS) {
        this._entries.set(id, { ...entry, status: 'error' });
        changed = true;
      }
    }

    return changed;
  }

  /** Force-resolve any timed-out file entries. Returns true if anything changed. */
  resolveTimeouts(timestamp?: number): boolean {
    const now = timestamp ?? this.now();
    let changed = false;
    for (const [id, entry] of this._entries) {
      if (entry.type === 'folder') continue;
      if (entry.status === 'pending' && now - entry.submittedAt > INDEXING_TIMEOUT_MS) {
        this._entries.set(id, { ...entry, status: 'error' });
        changed = true;
      }
    }
    return changed;
  }

  // ─── Submission planning (pure, for the hook's async flow) ────────────

  /**
   * Builds the payload for the index mutation.
   * Pure function — no side effects. The hook uses this to decide what to send.
   */
  buildAlreadyIndexed(kbResources: Resource[], newResourceIds: Set<string>): Resource[] {
    const alreadyById = new Map<string, Resource>();
    for (const r of kbResources) {
      if ((isKBDone(r.status) || r.status === 'pending') && !newResourceIds.has(r.resourceId)) {
        alreadyById.set(r.resourceId, r);
      }
    }
    for (const [id, r] of this._allSubmittedResources) {
      if (!newResourceIds.has(id) && !alreadyById.has(id)) {
        alreadyById.set(id, r);
      }
    }
    return [...alreadyById.values()];
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  private _hasJobSiblingInKB(
    fileId: string,
    entry: SubmittedEntry,
    kbStatusById: ReadonlyMap<string, ResourceStatus>,
    kbStatusByName: ReadonlyMap<string, ResourceStatus>,
  ): boolean {
    for (const [sibId, sib] of this._entries) {
      if (sibId === fileId) continue;
      if (sib.jobRootId !== entry.jobRootId) continue;
      if (sib.type !== 'file') continue;
      if (kbStatusById.has(sibId) || kbStatusByName.has(sib.name)) return true;
    }
    return false;
  }

  /**
   * Check that ALL pending file siblings from the same job are present in KB.
   * If any sibling is also absent, the server may not have finished this batch yet.
   */
  private _allJobSiblingsInKB(
    fileId: string,
    entry: SubmittedEntry,
    kbStatusById: ReadonlyMap<string, ResourceStatus>,
    kbStatusByName: ReadonlyMap<string, ResourceStatus>,
  ): boolean {
    for (const [sibId, sib] of this._entries) {
      if (sibId === fileId) continue;
      if (sib.jobRootId !== entry.jobRootId) continue;
      if (sib.type !== 'file') continue;
      if (sib.status !== 'pending') continue; // only check pending siblings
      // If this sibling is pending AND absent from KB → server hasn't processed this job fully
      if (!kbStatusById.has(sibId) && !kbStatusByName.has(sib.name)) return false;
    }
    return true;
  }
}
