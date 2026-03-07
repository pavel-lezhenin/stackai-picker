import { describe, expect, it, beforeEach } from 'vitest';

import { IndexingEngine } from '@/lib/IndexingEngine';

import { mkResource, mkKBFile, mkChildren } from './_helpers';

// ═══════════════════════════════════════════════════════════════════════════════
// Categories C + D + E: Sequential, Concurrent & Batch Indexing
// ═══════════════════════════════════════════════════════════════════════════════

describe('IndexingEngine', () => {
  let engine: IndexingEngine;
  let clock: number;

  beforeEach(() => {
    engine = new IndexingEngine();
    clock = 1000;
    engine.now = () => clock;
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
});
