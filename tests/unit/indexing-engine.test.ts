import { describe, expect, it, beforeEach } from 'vitest';

import {
  IndexingEngine,
  INDEXING_TIMEOUT_MS,
  isKBDone,
  getFileDescendants,
} from '@/lib/IndexingEngine';

import type { Resource, SubmittedEntry } from '@/types/resource';

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function mkResource(
  id: string,
  name: string,
  type: 'file' | 'folder',
  status: Resource['status'] = null,
): Resource {
  return { resourceId: id, name, type, status, modifiedAt: null, path: `/${name}` };
}

function mkKBFile(id: string, name: string, status: Resource['status'] = 'indexed'): Resource {
  return mkResource(id, name, 'file', status);
}

/** Simulate folder expansion — returns flat list of children with parentId. */
function mkChildren(
  folderId: string,
  files: Array<{ id: string; name: string; type?: 'file' | 'folder'; parentId?: string }>,
) {
  return files.map((f) => ({
    resourceId: f.id,
    name: f.name,
    type: (f.type ?? 'file') as 'file' | 'folder',
    parentId: f.parentId ?? folderId,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utility function tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('isKBDone', () => {
  it('returns true for indexed', () => expect(isKBDone('indexed')).toBe(true));
  it('returns true for parsed', () => expect(isKBDone('parsed')).toBe(true));
  it('returns false for pending', () => expect(isKBDone('pending')).toBe(false));
  it('returns false for null', () => expect(isKBDone(null)).toBe(false));
  it('returns false for error', () => expect(isKBDone('error')).toBe(false));
  it('returns false for resource', () => expect(isKBDone('resource')).toBe(false));
});

describe('getFileDescendants', () => {
  it('returns direct file children', () => {
    const entries = new Map<string, SubmittedEntry>([
      [
        'folder1',
        {
          name: 'f1',
          type: 'folder',
          parentId: 'root',
          status: 'pending',
          jobRootId: 'folder1',
          submittedAt: 0,
        },
      ],
      [
        'file1',
        {
          name: 'a.txt',
          type: 'file',
          parentId: 'folder1',
          status: 'pending',
          jobRootId: 'folder1',
          submittedAt: 0,
        },
      ],
      [
        'file2',
        {
          name: 'b.txt',
          type: 'file',
          parentId: 'folder1',
          status: 'pending',
          jobRootId: 'folder1',
          submittedAt: 0,
        },
      ],
    ]);
    const result = getFileDescendants('folder1', entries);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name)).toContain('a.txt');
    expect(result.map((r) => r.name)).toContain('b.txt');
  });

  it('returns nested file descendants through subfolders', () => {
    const entries = new Map<string, SubmittedEntry>([
      [
        'sub',
        {
          name: 'sub',
          type: 'folder',
          parentId: 'root',
          status: 'pending',
          jobRootId: 'root',
          submittedAt: 0,
        },
      ],
      [
        'file1',
        {
          name: 'a.txt',
          type: 'file',
          parentId: 'sub',
          status: 'pending',
          jobRootId: 'root',
          submittedAt: 0,
        },
      ],
    ]);
    const result = getFileDescendants('root', entries);
    // 'sub' is a subfolder of root (parentId=root), and 'file1' is inside sub
    // getFileDescendants should recurse and find file1
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('a.txt');
  });

  it('does not infinite loop on self-reference', () => {
    const entries = new Map<string, SubmittedEntry>([
      [
        'x',
        {
          name: 'x',
          type: 'folder',
          parentId: 'x',
          status: 'pending',
          jobRootId: 'x',
          submittedAt: 0,
        },
      ],
    ]);
    const result = getFileDescendants('x', entries);
    expect(result).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// IndexingEngine tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('IndexingEngine', () => {
  let engine: IndexingEngine;
  let clock: number;

  beforeEach(() => {
    engine = new IndexingEngine();
    clock = 1000;
    engine.now = () => clock;
  });

  // ─── Category A: Single Resource Indexing ─────────────────────────────

  describe('A: Single Resource Indexing', () => {
    it('A1: single folder with files — mark pending, expand, resolve', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      engine.markPending([acme], clock);

      expect(engine.getDisplayStatus('acme', clock)).toBe('pending');

      // Folder expansion
      engine.expandFolder(
        'acme',
        mkChildren('acme', [
          { id: 'f1', name: 'report.pdf' },
          { id: 'f2', name: 'data.csv' },
        ]),
        clock,
      );

      expect(engine.getDisplayStatus('acme', clock)).toBe('pending');
      expect(engine.getDisplayStatus('f1', clock)).toBe('pending');
      expect(engine.getDisplayStatus('f2', clock)).toBe('pending');

      // KB poll: all indexed
      engine.resolveFromKBData([mkKBFile('f1', 'report.pdf'), mkKBFile('f2', 'data.csv')], clock);

      expect(engine.getDisplayStatus('f1', clock)).toBe('indexed');
      expect(engine.getDisplayStatus('f2', clock)).toBe('indexed');
      expect(engine.getDisplayStatus('acme', clock)).toBe('indexed');
      expect(engine.hasActiveJobs).toBe(false);
    });

    it('A2: single FILE (not folder) — mark pending, resolve', () => {
      const file = mkResource('readme', 'readme.txt', 'file');
      engine.markPending([file], clock);

      expect(engine.getDisplayStatus('readme', clock)).toBe('pending');
      expect(engine.hasActiveJobs).toBe(true);

      engine.resolveFromKBData([mkKBFile('readme', 'readme.txt')], clock);

      expect(engine.getDisplayStatus('readme', clock)).toBe('indexed');
      expect(engine.hasActiveJobs).toBe(false);
    });

    it('A3: single file inside a folder — only that file pending', () => {
      const file = mkResource('report', 'report.pdf', 'file');
      engine.markPending([file], clock);

      expect(engine.getDisplayStatus('report', clock)).toBe('pending');
      // Folder 'acme' is NOT tracked
      expect(engine.getDisplayStatus('acme', clock)).toBeNull();

      engine.resolveFromKBData([mkKBFile('report', 'report.pdf')], clock);
      expect(engine.getDisplayStatus('report', clock)).toBe('indexed');
    });

    it('A4: empty folder — expand with no children, remove entry', () => {
      const empty = mkResource('empty', 'empty', 'folder');
      engine.markPending([empty], clock);
      expect(engine.getDisplayStatus('empty', clock)).toBe('pending');

      // Folder resolves to no children → hook removes entry
      engine.expandFolder('empty', [], clock);
      engine.removeEntries(['empty']); // hook cleans up pseudo-entries with no children

      // After cleanup there shouldn't be a leftover folder entry
      // (expandFolder already deleted it, removeEntries is a no-op but safe)
      expect(engine.getDisplayStatus('empty', clock)).toBeNull();
      expect(engine.hasActiveJobs).toBe(false);
    });

    it('A5: folder with nested subfolder — full depth resolution', () => {
      const books = mkResource('books', 'books', 'folder');
      engine.markPending([books], clock);

      // Expansion: books → chapters (subfolder) + summary.txt
      // chapters → chapter1.txt, chapter2.txt
      engine.expandFolder(
        'books',
        mkChildren('books', [
          { id: 'chapters', name: 'chapters', type: 'folder' },
          { id: 'summary', name: 'summary.txt', type: 'file' },
          { id: 'ch1', name: 'chapter1.txt', type: 'file', parentId: 'chapters' },
          { id: 'ch2', name: 'chapter2.txt', type: 'file', parentId: 'chapters' },
        ]),
        clock,
      );

      expect(engine.getDisplayStatus('books', clock)).toBe('pending');
      expect(engine.getDisplayStatus('chapters', clock)).toBe('pending');
      expect(engine.getDisplayStatus('summary', clock)).toBe('pending');

      // All files indexed
      engine.resolveFromKBData(
        [
          mkKBFile('summary', 'summary.txt'),
          mkKBFile('ch1', 'chapter1.txt'),
          mkKBFile('ch2', 'chapter2.txt'),
        ],
        clock,
      );

      expect(engine.getDisplayStatus('summary', clock)).toBe('indexed');
      expect(engine.getDisplayStatus('ch1', clock)).toBe('indexed');
      expect(engine.getDisplayStatus('chapters', clock)).toBe('indexed');
      expect(engine.getDisplayStatus('books', clock)).toBe('indexed');
    });

    it('A6: deeply nested folder (3+ levels)', () => {
      const clients = mkResource('clients', 'clients', 'folder');
      engine.markPending([clients], clock);

      engine.expandFolder(
        'clients',
        mkChildren('clients', [
          { id: 'archived', name: 'archived', type: 'folder' },
          { id: 'a-file', name: 'contact.txt', type: 'file', parentId: 'archived' },
          { id: '2024', name: '2024', type: 'folder', parentId: 'archived' },
          { id: 'deep-file', name: 'invoice.pdf', type: 'file', parentId: '2024' },
        ]),
        clock,
      );

      expect(engine.getDisplayStatus('clients', clock)).toBe('pending');
      expect(engine.getDisplayStatus('archived', clock)).toBe('pending');
      expect(engine.getDisplayStatus('2024', clock)).toBe('pending');

      engine.resolveFromKBData(
        [mkKBFile('a-file', 'contact.txt'), mkKBFile('deep-file', 'invoice.pdf')],
        clock,
      );

      expect(engine.getDisplayStatus('deep-file', clock)).toBe('indexed');
      expect(engine.getDisplayStatus('2024', clock)).toBe('indexed');
      expect(engine.getDisplayStatus('archived', clock)).toBe('indexed');
      expect(engine.getDisplayStatus('clients', clock)).toBe('indexed');
    });

    it('A7: folder with only subfolders (no direct files)', () => {
      const parent = mkResource('parent', 'parent', 'folder');
      engine.markPending([parent], clock);

      engine.expandFolder(
        'parent',
        mkChildren('parent', [
          { id: 'sub1', name: 'sub1', type: 'folder' },
          { id: 'sub2', name: 'sub2', type: 'folder' },
          { id: 'f1', name: 'a.txt', type: 'file', parentId: 'sub1' },
          { id: 'f2', name: 'b.txt', type: 'file', parentId: 'sub2' },
        ]),
        clock,
      );

      // No direct files under parent, but descendant files exist
      expect(engine.getDisplayStatus('parent', clock)).toBe('pending');

      engine.resolveFromKBData([mkKBFile('f1', 'a.txt'), mkKBFile('f2', 'b.txt')], clock);

      expect(engine.getDisplayStatus('sub1', clock)).toBe('indexed');
      expect(engine.getDisplayStatus('sub2', clock)).toBe('indexed');
      expect(engine.getDisplayStatus('parent', clock)).toBe('indexed');
    });
  });

  // ─── Category B: Navigation (status queries at different states) ──────

  describe('B: Navigation & Display Status', () => {
    it('B1: pending files inside a folder are visible', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      engine.markPending([acme], clock);
      engine.expandFolder(
        'acme',
        mkChildren('acme', [
          { id: 'f1', name: 'report.pdf' },
          { id: 'f2', name: 'data.csv' },
        ]),
        clock,
      );

      expect(engine.getDisplayStatus('f1', clock)).toBe('pending');
      expect(engine.getDisplayStatus('f2', clock)).toBe('pending');
    });

    it('B2: indexed files persist after resolution', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      engine.markPending([acme], clock);
      engine.expandFolder('acme', mkChildren('acme', [{ id: 'f1', name: 'a.txt' }]), clock);
      engine.resolveFromKBData([mkKBFile('f1', 'a.txt')], clock);

      // Query again — still indexed
      expect(engine.getDisplayStatus('f1', clock + 5000)).toBe('indexed');
      expect(engine.getDisplayStatus('acme', clock + 5000)).toBe('indexed');
    });

    it('B3: unrelated folder returns null (not tracked)', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      engine.markPending([acme], clock);
      engine.expandFolder('acme', mkChildren('acme', [{ id: 'f1', name: 'a.txt' }]), clock);

      // Different, untracked folder
      expect(engine.getDisplayStatus('clients', clock)).toBeNull();
    });

    it('B4: subfolder status is derived from children during indexing', () => {
      const books = mkResource('books', 'books', 'folder');
      engine.markPending([books], clock);
      engine.expandFolder(
        'books',
        mkChildren('books', [
          { id: 'chapters', name: 'chapters', type: 'folder' },
          { id: 'summary', name: 'summary.txt' },
          { id: 'ch1', name: 'chapter1.txt', parentId: 'chapters' },
          { id: 'ch2', name: 'chapter2.txt', parentId: 'chapters' },
        ]),
        clock,
      );

      // Partial: summary indexed, chapters still pending
      engine.resolveFromKBData([mkKBFile('summary', 'summary.txt')], clock);

      expect(engine.getDisplayStatus('summary', clock)).toBe('indexed');
      expect(engine.getDisplayStatus('ch1', clock)).toBe('pending');
      expect(engine.getDisplayStatus('chapters', clock)).toBe('pending');
      expect(engine.getDisplayStatus('books', clock)).toBe('pending');
    });

    it('B5: indexing continues conceptually even if we query different folders', () => {
      const books = mkResource('books', 'books', 'folder');
      engine.markPending([books], clock);
      engine.expandFolder('books', mkChildren('books', [{ id: 'f1', name: 'a.txt' }]), clock);

      // Query unrelated folder — should return null, books unchanged
      expect(engine.getDisplayStatus('clients', clock)).toBeNull();
      expect(engine.getDisplayStatus('books', clock)).toBe('pending');

      // Later resolve
      engine.resolveFromKBData([mkKBFile('f1', 'a.txt')], clock);
      expect(engine.getDisplayStatus('books', clock)).toBe('indexed');
    });
  });

  // ─── Category C: Sequential Indexing ──────────────────────────────────

  describe('C: Sequential Indexing', () => {
    it('C1: two folders sequentially — both resolve independently', () => {
      // First folder
      const books = mkResource('books', 'books', 'folder');
      engine.markPending([books], clock);
      engine.expandFolder('books', mkChildren('books', [{ id: 'bf1', name: 'b.txt' }]), clock);
      engine.trackSubmittedFiles([mkResource('bf1', 'b.txt', 'file')]);
      engine.resolveFromKBData([mkKBFile('bf1', 'b.txt')], clock);
      expect(engine.getDisplayStatus('books', clock)).toBe('indexed');

      // Second folder
      const clients = mkResource('clients', 'clients', 'folder');
      engine.markPending([clients], clock + 1000);
      engine.expandFolder(
        'clients',
        mkChildren('clients', [{ id: 'cf1', name: 'c.txt' }]),
        clock + 1000,
      );
      engine.resolveFromKBData([mkKBFile('bf1', 'b.txt'), mkKBFile('cf1', 'c.txt')], clock + 1000);

      expect(engine.getDisplayStatus('books', clock + 1000)).toBe('indexed');
      expect(engine.getDisplayStatus('clients', clock + 1000)).toBe('indexed');
    });

    it('C3: cross-job — one completes, other stays pending (no Rule 2 cross-contamination)', () => {
      // Job A: clients (large)
      const clients = mkResource('clients', 'clients', 'folder');
      engine.markPending([clients], clock);
      engine.expandFolder(
        'clients',
        mkChildren('clients', [
          { id: 'cf1', name: 'client-a.txt' },
          { id: 'cf2', name: 'client-b.txt' },
        ]),
        clock,
      );

      // Job B: chapters (small)
      const chapters = mkResource('chapters', 'chapters', 'folder');
      engine.markPending([chapters], clock + 100);
      engine.expandFolder(
        'chapters',
        mkChildren('chapters', [{ id: 'ch1', name: 'chapter1.txt' }]),
        clock + 100,
      );

      // KB poll: chapters done, clients not yet
      engine.resolveFromKBData([mkKBFile('ch1', 'chapter1.txt')], clock + 200);

      expect(engine.getDisplayStatus('chapters', clock + 200)).toBe('indexed');
      // clients must stay pending — NOT error
      expect(engine.getDisplayStatus('cf1', clock + 200)).toBe('pending');
      expect(engine.getDisplayStatus('cf2', clock + 200)).toBe('pending');
      expect(engine.getDisplayStatus('clients', clock + 200)).toBe('pending');
    });

    it('C3b: Rule 2 fires when sibling IS in KB but file is absent', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      engine.markPending([acme], clock);
      engine.expandFolder(
        'acme',
        mkChildren('acme', [
          { id: 'f1', name: 'report.pdf' },
          { id: 'f2', name: 'data.csv' },
        ]),
        clock,
      );

      // KB has f1 indexed, f2 missing — all KB files indexed
      engine.resolveFromKBData([mkKBFile('f1', 'report.pdf')], clock);

      // f1 indexed, f2 still pending (only 1 KB file, allKBFilesIndexed=true but f2 absent)
      // Rule 2: allKBFilesIndexed + jobSibling(f1) in KB + f2 absent → error
      expect(engine.getDisplayStatus('f1', clock)).toBe('indexed');
      expect(engine.getDisplayStatus('f2', clock)).toBe('error');
    });

    it('C4: re-index subfolder after parent already indexed — dedup safe', () => {
      const books = mkResource('books', 'books', 'folder');
      engine.markPending([books], clock);
      engine.expandFolder(
        'books',
        mkChildren('books', [
          { id: 'chapters', name: 'chapters', type: 'folder' },
          { id: 'ch1', name: 'chapter1.txt', parentId: 'chapters' },
          { id: 'summary', name: 'summary.txt' },
        ]),
        clock,
      );
      engine.resolveFromKBData(
        [mkKBFile('ch1', 'chapter1.txt'), mkKBFile('summary', 'summary.txt')],
        clock,
      );
      expect(engine.getDisplayStatus('books', clock)).toBe('indexed');

      // Now separately index chapters
      const chFolder = mkResource('chapters', 'chapters', 'folder');
      engine.markPending([chFolder], clock + 1000);
      engine.expandFolder(
        'chapters',
        mkChildren('chapters', [{ id: 'ch1', name: 'chapter1.txt' }]),
        clock + 1000,
      );

      // ch1 already in KB
      engine.resolveFromKBData(
        [mkKBFile('ch1', 'chapter1.txt'), mkKBFile('summary', 'summary.txt')],
        clock + 1000,
      );
      expect(engine.getDisplayStatus('chapters', clock + 1000)).toBe('indexed');
    });
  });

  // ─── Category D: Rapid-Fire / Concurrent ──────────────────────────────

  describe('D: Rapid-Fire / Concurrent Indexing', () => {
    it('D1: three folders submitted rapidly — all resolve', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      const books = mkResource('books', 'books', 'folder');
      const clients = mkResource('clients', 'clients', 'folder');

      // All pending immediately
      engine.markPending([acme], clock);
      engine.markPending([books], clock + 1);
      engine.markPending([clients], clock + 2);

      expect(engine.getDisplayStatus('acme', clock)).toBe('pending');
      expect(engine.getDisplayStatus('books', clock)).toBe('pending');
      expect(engine.getDisplayStatus('clients', clock)).toBe('pending');

      // Expand sequentially (as queue would)
      engine.expandFolder('acme', mkChildren('acme', [{ id: 'af1', name: 'a.txt' }]), clock);
      engine.trackSubmittedFiles([mkResource('af1', 'a.txt', 'file')]);

      engine.expandFolder('books', mkChildren('books', [{ id: 'bf1', name: 'b.txt' }]), clock + 1);
      engine.trackSubmittedFiles([mkResource('bf1', 'b.txt', 'file')]);

      engine.expandFolder(
        'clients',
        mkChildren('clients', [{ id: 'cf1', name: 'c.txt' }]),
        clock + 2,
      );
      engine.trackSubmittedFiles([mkResource('cf1', 'c.txt', 'file')]);

      // KB poll: all indexed
      engine.resolveFromKBData(
        [mkKBFile('af1', 'a.txt'), mkKBFile('bf1', 'b.txt'), mkKBFile('cf1', 'c.txt')],
        clock + 5000,
      );

      expect(engine.getDisplayStatus('acme', clock + 5000)).toBe('indexed');
      expect(engine.getDisplayStatus('books', clock + 5000)).toBe('indexed');
      expect(engine.getDisplayStatus('clients', clock + 5000)).toBe('indexed');
      expect(engine.hasActiveJobs).toBe(false);
    });

    it('D2: double-click same folder — second markPending overwrites, still resolves', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      engine.markPending([acme], clock);
      engine.markPending([acme], clock + 50); // double click

      // Still just one pending entry
      expect(engine.entries.size).toBe(1);
      expect(engine.getDisplayStatus('acme', clock + 50)).toBe('pending');

      engine.expandFolder('acme', mkChildren('acme', [{ id: 'f1', name: 'a.txt' }]), clock + 50);
      engine.resolveFromKBData([mkKBFile('f1', 'a.txt')], clock + 1000);
      expect(engine.getDisplayStatus('acme', clock + 1000)).toBe('indexed');
    });

    it('D3: rapid clicks with different-size folders — no cross-contamination', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      const clients = mkResource('clients', 'clients', 'folder');
      engine.markPending([acme], clock);
      engine.markPending([clients], clock + 10);

      engine.expandFolder('acme', mkChildren('acme', [{ id: 'af1', name: 'small.txt' }]), clock);
      engine.expandFolder(
        'clients',
        mkChildren('clients', [
          { id: 'cf1', name: 'big1.txt' },
          { id: 'cf2', name: 'big2.txt' },
          { id: 'cf3', name: 'big3.txt' },
        ]),
        clock + 10,
      );

      // Only acme files in KB so far
      engine.resolveFromKBData([mkKBFile('af1', 'small.txt')], clock + 5000);

      expect(engine.getDisplayStatus('acme', clock + 5000)).toBe('indexed');
      // clients still pending — Rule 2 scoped by jobRootId
      expect(engine.getDisplayStatus('cf1', clock + 5000)).toBe('pending');
      expect(engine.getDisplayStatus('clients', clock + 5000)).toBe('pending');

      // Later: clients complete
      engine.resolveFromKBData(
        [
          mkKBFile('af1', 'small.txt'),
          mkKBFile('cf1', 'big1.txt'),
          mkKBFile('cf2', 'big2.txt'),
          mkKBFile('cf3', 'big3.txt'),
        ],
        clock + 10000,
      );

      expect(engine.getDisplayStatus('clients', clock + 10000)).toBe('indexed');
    });
  });

  // ─── Category E: Batch Indexing ───────────────────────────────────────

  describe('E: Batch Indexing', () => {
    it('E1: batch — all folders marked pending at once', () => {
      const resources = [
        mkResource('acme', 'acme', 'folder'),
        mkResource('books', 'books', 'folder'),
        mkResource('clients', 'clients', 'folder'),
      ];
      engine.markPending(resources, clock);

      expect(engine.getDisplayStatus('acme', clock)).toBe('pending');
      expect(engine.getDisplayStatus('books', clock)).toBe('pending');
      expect(engine.getDisplayStatus('clients', clock)).toBe('pending');
    });

    it('E2: batch mix of files and folders', () => {
      const resources = [
        mkResource('acme', 'acme', 'folder'),
        mkResource('readme', 'readme.txt', 'file'),
      ];
      engine.markPending(resources, clock);

      expect(engine.getDisplayStatus('acme', clock)).toBe('pending');
      expect(engine.getDisplayStatus('readme', clock)).toBe('pending');

      engine.expandFolder('acme', mkChildren('acme', [{ id: 'f1', name: 'a.txt' }]), clock);

      engine.resolveFromKBData([mkKBFile('f1', 'a.txt'), mkKBFile('readme', 'readme.txt')], clock);

      expect(engine.getDisplayStatus('acme', clock)).toBe('indexed');
      expect(engine.getDisplayStatus('readme', clock)).toBe('indexed');
    });

    it('E3: batch then single — all tracked independently', () => {
      // Batch
      engine.markPending(
        [mkResource('acme', 'acme', 'folder'), mkResource('books', 'books', 'folder')],
        clock,
      );
      engine.expandFolder('acme', mkChildren('acme', [{ id: 'af1', name: 'a.txt' }]), clock);
      engine.expandFolder('books', mkChildren('books', [{ id: 'bf1', name: 'b.txt' }]), clock);

      // Single (later)
      engine.markPending([mkResource('clients', 'clients', 'folder')], clock + 100);
      engine.expandFolder(
        'clients',
        mkChildren('clients', [{ id: 'cf1', name: 'c.txt' }]),
        clock + 100,
      );

      // All resolve
      engine.resolveFromKBData(
        [mkKBFile('af1', 'a.txt'), mkKBFile('bf1', 'b.txt'), mkKBFile('cf1', 'c.txt')],
        clock + 5000,
      );

      expect(engine.getDisplayStatus('acme', clock + 5000)).toBe('indexed');
      expect(engine.getDisplayStatus('books', clock + 5000)).toBe('indexed');
      expect(engine.getDisplayStatus('clients', clock + 5000)).toBe('indexed');
    });
  });

  // ─── Category F: Error Cases & Recovery ───────────────────────────────

  describe('F: Error Cases & Recovery', () => {
    it('F1: network error — removeEntries cleans up', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      engine.markPending([acme], clock);

      // Simulate fetchFolderChildren failure → hook calls removeEntries
      engine.removeEntries(['acme']);

      expect(engine.getDisplayStatus('acme', clock)).toBeNull();
      expect(engine.hasActiveJobs).toBe(false);
    });

    it('F2: mutation failure — cleanup all entries', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      engine.markPending([acme], clock);
      engine.expandFolder(
        'acme',
        mkChildren('acme', [
          { id: 'f1', name: 'a.txt' },
          { id: 'f2', name: 'b.txt' },
        ]),
        clock,
      );

      // Mutation fails → remove originals + expanded children
      engine.removeEntries(['acme', 'f1', 'f2']);

      expect(engine.getDisplayStatus('acme', clock)).toBeNull();
      expect(engine.getDisplayStatus('f1', clock)).toBeNull();
      expect(engine.hasActiveJobs).toBe(false);
    });

    it('F3: timeout — pending → error after INDEXING_TIMEOUT_MS', () => {
      const file = mkResource('f1', 'a.txt', 'file');
      engine.markPending([file], clock);

      expect(engine.getDisplayStatus('f1', clock)).toBe('pending');
      expect(engine.getDisplayStatus('f1', clock + INDEXING_TIMEOUT_MS - 1)).toBe('pending');
      expect(engine.getDisplayStatus('f1', clock + INDEXING_TIMEOUT_MS + 1)).toBe('error');
    });

    it('F3b: resolveTimeouts force-resolves timed-out entries', () => {
      const file = mkResource('f1', 'a.txt', 'file');
      engine.markPending([file], clock);

      const changed1 = engine.resolveTimeouts(clock + 1000);
      expect(changed1).toBe(false);
      expect(engine.getDisplayStatus('f1', clock + 1000)).toBe('pending');

      const changed2 = engine.resolveTimeouts(clock + INDEXING_TIMEOUT_MS + 1);
      expect(changed2).toBe(true);
      expect(engine.getDisplayStatus('f1', clock + INDEXING_TIMEOUT_MS + 1)).toBe('error');
    });

    it('F4: partial failure — some indexed, some absent → Rule 2 error', () => {
      engine.markPending([mkResource('books', 'books', 'folder')], clock);
      engine.expandFolder(
        'books',
        mkChildren('books', [
          { id: 'summary', name: 'summary.txt' },
          { id: 'ch1', name: 'chapter1.txt' },
          { id: 'ch2', name: 'chapter2.txt' },
        ]),
        clock,
      );

      // Only summary and ch1 indexed, ch2 absent
      engine.resolveFromKBData(
        [mkKBFile('summary', 'summary.txt'), mkKBFile('ch1', 'chapter1.txt')],
        clock,
      );

      expect(engine.getDisplayStatus('summary', clock)).toBe('indexed');
      expect(engine.getDisplayStatus('ch1', clock)).toBe('indexed');
      // Rule 2: allKBFilesIndexed=true, ch2 absent, sibling (summary) in KB → error
      expect(engine.getDisplayStatus('ch2', clock)).toBe('error');
    });

    it('F5: re-index after error — fresh pending overwrites old error', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      engine.markPending([acme], clock);
      engine.expandFolder('acme', mkChildren('acme', [{ id: 'f1', name: 'a.txt' }]), clock);

      // Timeout
      engine.resolveTimeouts(clock + INDEXING_TIMEOUT_MS + 1);
      expect(engine.getDisplayStatus('f1', clock + INDEXING_TIMEOUT_MS + 1)).toBe('error');

      // Re-index
      const newTime = clock + INDEXING_TIMEOUT_MS + 2000;
      engine.markPending([acme], newTime);
      engine.expandFolder('acme', mkChildren('acme', [{ id: 'f1', name: 'a.txt' }]), newTime);

      expect(engine.getDisplayStatus('f1', newTime)).toBe('pending');

      // This time server responds
      engine.resolveFromKBData([mkKBFile('f1', 'a.txt')], newTime + 1000);
      expect(engine.getDisplayStatus('f1', newTime + 1000)).toBe('indexed');
    });

    it('F6: re-index after partial error', () => {
      engine.markPending([mkResource('books', 'books', 'folder')], clock);
      engine.expandFolder(
        'books',
        mkChildren('books', [
          { id: 'f1', name: 'a.txt' },
          { id: 'f2', name: 'b.txt' },
        ]),
        clock,
      );

      // Partial: f1 indexed, f2 absent → error
      engine.resolveFromKBData([mkKBFile('f1', 'a.txt')], clock);
      expect(engine.getDisplayStatus('f2', clock)).toBe('error');

      // Re-index books — fresh timestamps
      const t2 = clock + 5000;
      engine.markPending([mkResource('books', 'books', 'folder')], t2);
      engine.expandFolder(
        'books',
        mkChildren('books', [
          { id: 'f1', name: 'a.txt' },
          { id: 'f2', name: 'b.txt' },
        ]),
        t2,
      );

      expect(engine.getDisplayStatus('f2', t2)).toBe('pending');

      engine.resolveFromKBData([mkKBFile('f1', 'a.txt'), mkKBFile('f2', 'b.txt')], t2 + 1000);
      expect(engine.getDisplayStatus('f1', t2 + 1000)).toBe('indexed');
      expect(engine.getDisplayStatus('f2', t2 + 1000)).toBe('indexed');
      expect(engine.getDisplayStatus('books', t2 + 1000)).toBe('indexed');
    });
  });

  // ─── Category G: Edge Cases & Deduplication ───────────────────────────

  describe('G: Edge Cases & Deduplication', () => {
    it('G1: same file name in different folders — no collision', () => {
      engine.markPending([mkResource('books', 'books', 'folder')], clock);
      engine.expandFolder(
        'books',
        mkChildren('books', [{ id: 'books-readme', name: 'readme.txt' }]),
        clock,
      );

      engine.markPending([mkResource('clients', 'clients', 'folder')], clock + 100);
      engine.expandFolder(
        'clients',
        mkChildren('clients', [{ id: 'clients-readme', name: 'readme.txt' }]),
        clock + 100,
      );

      // Only books indexed, clients not
      engine.resolveFromKBData([mkKBFile('books-readme', 'readme.txt')], clock + 200);

      expect(engine.getDisplayStatus('books-readme', clock + 200)).toBe('indexed');
      // clients-readme: name matches in KB (readme.txt) → Rule 1 by name
      // This is the name-fallback behavior — both resolve by name
      // This test documents the current behavior
      expect(engine.getDisplayStatus('clients-readme', clock + 200)).toBe('indexed');
    });

    it('G1b: same name, different resource IDs — ID takes priority', () => {
      engine.markPending([mkResource('books', 'books', 'folder')], clock);
      engine.expandFolder(
        'books',
        mkChildren('books', [{ id: 'books-readme', name: 'readme.txt' }]),
        clock,
      );

      engine.markPending([mkResource('clients', 'clients', 'folder')], clock + 100);
      engine.expandFolder(
        'clients',
        mkChildren('clients', [{ id: 'clients-readme', name: 'readme.txt' }]),
        clock + 100,
      );

      // KB contains books-readme by ID, clients-readme NOT in KB by ID
      // But name 'readme.txt' matches → name fallback triggers
      const changed = engine.resolveFromKBData(
        [mkKBFile('books-readme', 'readme.txt')],
        clock + 200,
      );

      expect(changed).toBe(true);
      expect(engine.getDisplayStatus('books-readme', clock + 200)).toBe('indexed');
    });

    it('G3: buildAlreadyIndexed deduplicates correctly', () => {
      // Simulate first batch tracked
      engine.trackSubmittedFiles([
        mkResource('f1', 'a.txt', 'file'),
        mkResource('f2', 'b.txt', 'file'),
      ]);

      const kbResources = [mkKBFile('f1', 'a.txt')];
      const newIds = new Set(['f3']);

      const already = engine.buildAlreadyIndexed(kbResources, newIds);

      // f1 is in both KB and allSubmitted — should appear once
      // f2 is only in allSubmitted — should appear
      // f3 is the new one — should NOT appear
      expect(already).toHaveLength(2);
      const ids = already.map((r) => r.resourceId);
      expect(ids).toContain('f1');
      expect(ids).toContain('f2');
      expect(ids).not.toContain('f3');
    });

    it('G4: multiple single files from root', () => {
      engine.markPending([mkResource('readme', 'readme.txt', 'file')], clock);
      engine.markPending([mkResource('notes', 'notes.txt', 'file')], clock + 50);

      expect(engine.getDisplayStatus('readme', clock + 50)).toBe('pending');
      expect(engine.getDisplayStatus('notes', clock + 50)).toBe('pending');

      engine.resolveFromKBData(
        [mkKBFile('readme', 'readme.txt'), mkKBFile('notes', 'notes.txt')],
        clock + 5000,
      );

      expect(engine.getDisplayStatus('readme', clock + 5000)).toBe('indexed');
      expect(engine.getDisplayStatus('notes', clock + 5000)).toBe('indexed');
    });
  });

  // ─── Category H: Deindex ──────────────────────────────────────────────

  describe('H: Deindex', () => {
    it('H1: deindex removes file from tracking', () => {
      engine.markPending([mkResource('f1', 'a.txt', 'file')], clock);
      engine.trackSubmittedFiles([mkResource('f1', 'a.txt', 'file')]);
      engine.resolveFromKBData([mkKBFile('f1', 'a.txt')], clock);

      expect(engine.getDisplayStatus('f1', clock)).toBe('indexed');

      engine.deindex('f1');

      expect(engine.getDisplayStatus('f1', clock)).toBeNull();
      expect(engine.allSubmittedResources.has('f1')).toBe(false);
    });

    it('H2: deindex one file in a folder does not affect siblings', () => {
      engine.markPending([mkResource('acme', 'acme', 'folder')], clock);
      engine.expandFolder(
        'acme',
        mkChildren('acme', [
          { id: 'f1', name: 'a.txt' },
          { id: 'f2', name: 'b.txt' },
        ]),
        clock,
      );
      engine.resolveFromKBData([mkKBFile('f1', 'a.txt'), mkKBFile('f2', 'b.txt')], clock);

      engine.deindex('f1');

      expect(engine.getDisplayStatus('f1', clock)).toBeNull();
      expect(engine.getDisplayStatus('f2', clock)).toBe('indexed');
      // Folder status: f1 removed, f2 still indexed
      // jobRootId check: f2 has jobRootId='acme' → folder derives from f2 only → indexed
      expect(engine.getDisplayStatus('acme', clock)).toBe('indexed');
    });

    it('H3: deindex all files from a folder → folder returns null', () => {
      engine.markPending([mkResource('acme', 'acme', 'folder')], clock);
      engine.expandFolder(
        'acme',
        mkChildren('acme', [
          { id: 'f1', name: 'a.txt' },
          { id: 'f2', name: 'b.txt' },
        ]),
        clock,
      );
      engine.resolveFromKBData([mkKBFile('f1', 'a.txt'), mkKBFile('f2', 'b.txt')], clock);

      engine.deindex('f1');
      engine.deindex('f2');

      expect(engine.getDisplayStatus('acme', clock)).toBeNull();
    });
  });

  // ─── Category I: Mutation Sequence / KB ID ────────────────────────────

  describe('I: Mutation Sequence & KB State', () => {
    it('I1: setKbIdIfLatest only accepts latest seq', () => {
      const seq1 = engine.nextMutationSeq(); // 1
      const seq2 = engine.nextMutationSeq(); // 2

      // Response for seq1 arrives AFTER seq2 was issued
      engine.setKbIdIfLatest(seq1, 'old-kb');
      expect(engine.kbId).toBeUndefined(); // rejected

      engine.setKbIdIfLatest(seq2, 'new-kb');
      expect(engine.kbId).toBe('new-kb');
    });

    it('I2: latest mutation always wins regardless of arrival order', () => {
      const seq1 = engine.nextMutationSeq();
      const seq2 = engine.nextMutationSeq();
      const seq3 = engine.nextMutationSeq();

      // Responses arrive: seq3, seq1, seq2
      engine.setKbIdIfLatest(seq3, 'kb-3');
      expect(engine.kbId).toBe('kb-3');

      engine.setKbIdIfLatest(seq1, 'kb-1');
      expect(engine.kbId).toBe('kb-3'); // unchanged

      engine.setKbIdIfLatest(seq2, 'kb-2');
      expect(engine.kbId).toBe('kb-3'); // unchanged
    });

    it('I3: hasActiveJobs reflects entry states', () => {
      expect(engine.hasActiveJobs).toBe(false);

      engine.markPending([mkResource('f1', 'a.txt', 'file')], clock);
      expect(engine.hasActiveJobs).toBe(true);

      engine.resolveFromKBData([mkKBFile('f1', 'a.txt')], clock);
      expect(engine.hasActiveJobs).toBe(false);
    });

    it('I4: snapshot returns a shallow clone', () => {
      engine.markPending([mkResource('f1', 'a.txt', 'file')], clock);
      const snap = engine.snapshot();

      expect(snap.size).toBe(1);
      expect(snap.get('f1')?.status).toBe('pending');

      // Mutating engine doesn't affect snapshot
      engine.resolveFromKBData([mkKBFile('f1', 'a.txt')], clock);
      expect(snap.get('f1')?.status).toBe('pending'); // snapshot unchanged
      expect(engine.entries.get('f1')?.status).toBe('indexed');
    });
  });

  // ─── Category J: Resolution rule edge cases ───────────────────────────

  describe('J: Resolution rule edge cases', () => {
    it('J1: Rule 1 matches by name when ID differs (KB uses different ID)', () => {
      engine.markPending([mkResource('f1', 'a.txt', 'file')], clock);

      // KB returns same file but with different resource_id
      engine.resolveFromKBData([mkKBFile('different-id', 'a.txt')], clock);

      expect(engine.getDisplayStatus('f1', clock)).toBe('indexed');
    });

    it('J2: Rule 2 does NOT fire without job sibling in KB', () => {
      engine.markPending([mkResource('acme', 'acme', 'folder')], clock);
      engine.expandFolder(
        'acme',
        mkChildren('acme', [
          { id: 'f1', name: 'a.txt' },
          { id: 'f2', name: 'b.txt' },
        ]),
        clock,
      );

      // KB has ONLY an unrelated file
      engine.resolveFromKBData([mkKBFile('unrelated', 'other.txt')], clock);

      // f1 and f2 should stay pending — no job sibling in KB
      expect(engine.getDisplayStatus('f1', clock)).toBe('pending');
      expect(engine.getDisplayStatus('f2', clock)).toBe('pending');
    });

    it('J3: Rule 2 fires only when ALL KB files are done', () => {
      engine.markPending([mkResource('acme', 'acme', 'folder')], clock);
      engine.expandFolder(
        'acme',
        mkChildren('acme', [
          { id: 'f1', name: 'a.txt' },
          { id: 'f2', name: 'b.txt' },
          { id: 'f3', name: 'c.txt' },
        ]),
        clock,
      );

      // f1 indexed, f2 still pending in KB, f3 absent
      engine.resolveFromKBData(
        [mkKBFile('f1', 'a.txt', 'indexed'), mkKBFile('f2', 'b.txt', 'pending')],
        clock,
      );

      // f1 indexed by Rule 1
      expect(engine.getDisplayStatus('f1', clock)).toBe('indexed');
      // f2 NOT resolved (pending in KB)
      expect(engine.getDisplayStatus('f2', clock)).toBe('pending');
      // f3 NOT errored — allKBFilesIndexed is false (f2 is pending in KB)
      expect(engine.getDisplayStatus('f3', clock)).toBe('pending');
    });

    it('J4: parsed status treated as done', () => {
      engine.markPending([mkResource('f1', 'a.txt', 'file')], clock);

      engine.resolveFromKBData([mkKBFile('f1', 'a.txt', 'parsed')], clock);

      expect(engine.getDisplayStatus('f1', clock)).toBe('indexed');
    });

    it('J5: resolveFromKBData returns false when nothing changes', () => {
      engine.markPending([mkResource('f1', 'a.txt', 'file')], clock);

      // No matching KB data
      const changed = engine.resolveFromKBData([], clock);
      expect(changed).toBe(false);
    });

    it('J6: resolveFromKBData returns true when something changes', () => {
      engine.markPending([mkResource('f1', 'a.txt', 'file')], clock);

      const changed = engine.resolveFromKBData([mkKBFile('f1', 'a.txt')], clock);
      expect(changed).toBe(true);
    });

    it('J7: already-resolved entries are not re-processed', () => {
      engine.markPending([mkResource('f1', 'a.txt', 'file')], clock);
      engine.resolveFromKBData([mkKBFile('f1', 'a.txt')], clock);

      // Call again — should be no-op
      const changed = engine.resolveFromKBData([mkKBFile('f1', 'a.txt')], clock);
      expect(changed).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // K: Deindex scenarios
  // ═══════════════════════════════════════════════════════════════════════════
  describe('K: Deindex', () => {
    it('K1: deindex a single indexed file — status returns to null', () => {
      const file = mkResource('readme', 'readme.txt', 'file');
      engine.markPending([file], clock);
      engine.trackSubmittedFiles([file]);
      engine.resolveFromKBData([mkKBFile('readme', 'readme.txt')], clock);

      expect(engine.getDisplayStatus('readme', clock)).toBe('indexed');

      engine.deindex('readme');

      expect(engine.getDisplayStatus('readme', clock)).toBeNull();
      expect(engine.allSubmittedResources.has('readme')).toBe(false);
      expect(engine.entries.has('readme')).toBe(false);
    });

    it('K2: deindex one file — sibling stays indexed', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      engine.markPending([acme], clock);
      engine.expandFolder(
        'acme',
        mkChildren('acme', [
          { id: 'f1', name: 'report.pdf' },
          { id: 'f2', name: 'data.csv' },
        ]),
        clock,
      );
      engine.resolveFromKBData([mkKBFile('f1', 'report.pdf'), mkKBFile('f2', 'data.csv')], clock);

      engine.deindex('f1');

      expect(engine.getDisplayStatus('f1', clock)).toBeNull();
      expect(engine.getDisplayStatus('f2', clock)).toBe('indexed');
      // Folder still has one indexed child via jobRootId
      expect(engine.getDisplayStatus('acme', clock)).toBe('indexed');
    });

    it('K3: deindex all files in a folder — folder status reverts to null', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      engine.markPending([acme], clock);
      engine.expandFolder(
        'acme',
        mkChildren('acme', [
          { id: 'f1', name: 'report.pdf' },
          { id: 'f2', name: 'data.csv' },
        ]),
        clock,
      );
      engine.resolveFromKBData([mkKBFile('f1', 'report.pdf'), mkKBFile('f2', 'data.csv')], clock);

      engine.deindex('f1');
      engine.deindex('f2');

      expect(engine.getDisplayStatus('f1', clock)).toBeNull();
      expect(engine.getDisplayStatus('f2', clock)).toBeNull();
      expect(engine.getDisplayStatus('acme', clock)).toBeNull();
    });

    it('K4: deindex then re-index the same file', () => {
      const file = mkResource('readme', 'readme.txt', 'file');
      engine.markPending([file], clock);
      engine.resolveFromKBData([mkKBFile('readme', 'readme.txt')], clock);

      expect(engine.getDisplayStatus('readme', clock)).toBe('indexed');

      engine.deindex('readme');
      expect(engine.getDisplayStatus('readme', clock)).toBeNull();

      // Re-index with fresh timestamp
      const laterClock = clock + 5000;
      engine.markPending([file], laterClock);

      expect(engine.getDisplayStatus('readme', laterClock)).toBe('pending');
      expect(engine.entries.get('readme')?.submittedAt).toBe(laterClock);
    });

    it('K5: deindex during active polling — remaining entries unaffected', () => {
      const books = mkResource('books', 'books', 'folder');
      engine.markPending([books], clock);
      engine.expandFolder(
        'books',
        mkChildren('books', [
          { id: 'summary', name: 'summary.txt' },
          { id: 'ch1', name: 'chapter1.txt' },
          { id: 'ch2', name: 'chapter2.txt' },
        ]),
        clock,
      );

      // summary indexed, others still pending
      engine.resolveFromKBData([mkKBFile('summary', 'summary.txt')], clock);
      expect(engine.getDisplayStatus('summary', clock)).toBe('indexed');

      // Deindex summary while ch1/ch2 still pending
      engine.deindex('summary');

      expect(engine.getDisplayStatus('summary', clock)).toBeNull();
      expect(engine.getDisplayStatus('ch1', clock)).toBe('pending');
      expect(engine.getDisplayStatus('ch2', clock)).toBe('pending');
      // books still pending (has pending children)
      expect(engine.getDisplayStatus('books', clock)).toBe('pending');
    });

    it('K7: batch deindex — multiple files removed', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      const books = mkResource('books', 'books', 'folder');
      engine.markPending([acme, books], clock);
      engine.expandFolder('acme', mkChildren('acme', [{ id: 'f1', name: 'report.pdf' }]), clock);
      engine.expandFolder('books', mkChildren('books', [{ id: 'f2', name: 'summary.txt' }]), clock);
      engine.resolveFromKBData(
        [mkKBFile('f1', 'report.pdf'), mkKBFile('f2', 'summary.txt')],
        clock,
      );

      // Batch deindex both
      engine.deindex('f1');
      engine.deindex('f2');

      expect(engine.getDisplayStatus('f1', clock)).toBeNull();
      expect(engine.getDisplayStatus('f2', clock)).toBeNull();
      expect(engine.getDisplayStatus('acme', clock)).toBeNull();
      expect(engine.getDisplayStatus('books', clock)).toBeNull();
    });

    it('K8: deindex folder removes all children with matching jobRootId', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      engine.markPending([acme], clock);
      engine.expandFolder(
        'acme',
        mkChildren('acme', [
          { id: 'f1', name: 'report.pdf' },
          { id: 'f2', name: 'data.csv' },
        ]),
        clock,
      );
      engine.resolveFromKBData([mkKBFile('f1', 'report.pdf'), mkKBFile('f2', 'data.csv')], clock);

      // Deindex folder — should remove children whose jobRootId matches
      engine.deindex('acme');

      // Children removed
      expect(engine.getDisplayStatus('f1', clock)).toBeNull();
      expect(engine.getDisplayStatus('f2', clock)).toBeNull();
      expect(engine.getDisplayStatus('acme', clock)).toBeNull();

      // Children marked as deindexed (prevent stale KB override)
      expect(engine.deindexedIds.has('f1')).toBe(true);
      expect(engine.deindexedIds.has('f2')).toBe(true);
    });

    it('M6: deindex folder should remove all children — currently BROKEN', () => {
      // Setup: index folder books/ with 3 files, all resolve to indexed
      const books = mkResource('books', 'books', 'folder');
      engine.markPending([books], clock);
      engine.expandFolder(
        'books',
        mkChildren('books', [
          { id: 'summary', name: 'summary.txt' },
          { id: 'ch1', name: 'chapter1.txt' },
          { id: 'ch2', name: 'chapter2.txt' },
        ]),
        clock,
      );
      engine.resolveFromKBData(
        [
          mkKBFile('summary', 'summary.txt'),
          mkKBFile('ch1', 'chapter1.txt'),
          mkKBFile('ch2', 'chapter2.txt'),
        ],
        clock,
      );

      // Another folder still indexing (polling active)
      const mixed = mkResource('mixed', 'mixed', 'folder');
      engine.markPending([mixed], clock);
      engine.expandFolder('mixed', mkChildren('mixed', [{ id: 'mf1', name: 'file1.txt' }]), clock);

      // Deindex books/ folder — should remove folder AND all children
      engine.deindex('books');

      // All children should be gone from entries
      expect(engine.getDisplayStatus('summary', clock)).toBeNull();
      expect(engine.getDisplayStatus('ch1', clock)).toBeNull();
      expect(engine.getDisplayStatus('ch2', clock)).toBeNull();

      // Folder itself should be null
      expect(engine.getDisplayStatus('books', clock)).toBeNull();

      // All children should be in deindexedIds (prevent stale KB override)
      expect(engine.deindexedIds.has('summary')).toBe(true);
      expect(engine.deindexedIds.has('ch1')).toBe(true);
      expect(engine.deindexedIds.has('ch2')).toBe(true);

      // Mixed folder still indexing — unaffected
      expect(engine.getDisplayStatus('mf1', clock)).toBe('pending');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // M: Delete/Deindex + Indexing interactions
  // ═══════════════════════════════════════════════════════════════════════════
  describe('M: Deindex + Indexing interactions', () => {
    it('M1: deindex one child — Rule 2 fires for absent sibling', () => {
      const books = mkResource('books', 'books', 'folder');
      engine.markPending([books], clock);
      engine.expandFolder(
        'books',
        mkChildren('books', [
          { id: 'summary', name: 'summary.txt' },
          { id: 'ch1', name: 'chapter1.txt' },
          { id: 'ch2', name: 'chapter2.txt' },
        ]),
        clock,
      );

      // summary indexed first
      engine.resolveFromKBData([mkKBFile('summary', 'summary.txt')], clock);

      // Deindex summary — ch1/ch2 still pending
      engine.deindex('summary');

      // KB returns ch1 indexed (summary gone from KB after deindex).
      // Rule 2 fires for ch2: ch1 (sibling, same jobRootId) in KB, all KB done, ch2 absent → error.
      engine.resolveFromKBData([mkKBFile('ch1', 'chapter1.txt')], clock);

      expect(engine.getDisplayStatus('ch1', clock)).toBe('indexed');
      expect(engine.getDisplayStatus('ch2', clock)).toBe('error');
      // summary gone from engine — not re-added by resolveFromKBData
      expect(engine.getDisplayStatus('summary', clock)).toBeNull();
    });

    it('M2: deindex file, then re-index parent folder', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      engine.markPending([acme], clock);
      engine.expandFolder(
        'acme',
        mkChildren('acme', [
          { id: 'f1', name: 'report.pdf' },
          { id: 'f2', name: 'data.csv' },
        ]),
        clock,
      );
      engine.resolveFromKBData([mkKBFile('f1', 'report.pdf'), mkKBFile('f2', 'data.csv')], clock);

      // Deindex one file
      engine.deindex('f1');
      expect(engine.getDisplayStatus('f1', clock)).toBeNull();

      // Re-index folder — markPending overwrites
      const laterClock = clock + 5000;
      engine.markPending([acme], laterClock);
      engine.expandFolder(
        'acme',
        mkChildren('acme', [
          { id: 'f1', name: 'report.pdf' },
          { id: 'f2', name: 'data.csv' },
        ]),
        laterClock,
      );

      // f1 is now pending again with new timestamp
      expect(engine.getDisplayStatus('f1', laterClock)).toBe('pending');
      // f2 also re-submitted as pending (new job)
      expect(engine.getDisplayStatus('f2', laterClock)).toBe('pending');
    });

    it('M4: rapid deindex + re-index same file', () => {
      const file = mkResource('readme', 'readme.txt', 'file');
      engine.markPending([file], clock);
      engine.resolveFromKBData([mkKBFile('readme', 'readme.txt')], clock);

      // Deindex
      engine.deindex('readme');
      expect(engine.entries.has('readme')).toBe(false);

      // Immediately re-index (before API completes — simulated by just calling markPending)
      const laterClock = clock + 100;
      engine.markPending([file], laterClock);

      expect(engine.getDisplayStatus('readme', laterClock)).toBe('pending');
      expect(engine.entries.get('readme')?.submittedAt).toBe(laterClock);

      // Resolve from KB — file re-indexed successfully
      engine.resolveFromKBData([mkKBFile('readme', 'readme.txt')], laterClock);
      expect(engine.getDisplayStatus('readme', laterClock)).toBe('indexed');
    });

    it('M5: deindex does not pollute buildAlreadyIndexed', () => {
      const f1 = mkResource('f1', 'report.pdf', 'file');
      const f2 = mkResource('f2', 'data.csv', 'file');
      engine.markPending([f1, f2], clock);
      engine.trackSubmittedFiles([f1, f2]);
      engine.resolveFromKBData([mkKBFile('f1', 'report.pdf'), mkKBFile('f2', 'data.csv')], clock);

      // Deindex f1
      engine.deindex('f1');

      // buildAlreadyIndexed should NOT include f1 anymore
      const already = engine.buildAlreadyIndexed(
        [mkKBFile('f2', 'data.csv')], // KB still has f2
        new Set(['f3']), // new resource being indexed
      );

      const alreadyIds = already.map((r) => r.resourceId);
      expect(alreadyIds).toContain('f2');
      expect(alreadyIds).not.toContain('f1');
    });

    it('M1b: standalone re-submit breaks sibling link — Rule 2 cannot fire', () => {
      const acme = mkResource('acme', 'acme', 'folder');
      engine.markPending([acme], clock);
      engine.expandFolder(
        'acme',
        mkChildren('acme', [
          { id: 'f1', name: 'report.pdf' },
          { id: 'f2', name: 'data.csv' },
          { id: 'f3', name: 'notes.txt' },
        ]),
        clock,
      );

      // f1 indexed, f2 indexed, f3 absent from KB
      engine.resolveFromKBData([mkKBFile('f1', 'report.pdf'), mkKBFile('f2', 'data.csv')], clock);

      // Without deindex: f3 is 'error' (Rule 2: all KB done, siblings in KB, f3 absent)
      expect(engine.getDisplayStatus('f3', clock)).toBe('error');

      // Re-submit f3 as standalone file — this gives it jobRootId='f3', breaking
      // the sibling link with f1/f2 (which have jobRootId='acme').
      engine.markPending([mkResource('f3', 'notes.txt', 'file')], clock + 1000);

      // Deindex f1 (former sibling)
      engine.deindex('f1');

      // Resolve: only f2 in KB.
      // f3 is now standalone (jobRootId='f3'), no siblings → Rule 2 cannot fire.
      // f3 stays pending.
      engine.resolveFromKBData([mkKBFile('f2', 'data.csv')], clock + 1000);

      expect(engine.getDisplayStatus('f3', clock + 1000)).toBe('pending');
    });
  });
});
