import { describe, expect, it, beforeEach } from 'vitest';

import { IndexingEngine } from '@/lib/IndexingEngine';

import { mkResource, mkKBFile, mkChildren } from './_helpers';

// ═══════════════════════════════════════════════════════════════════════════════
// Categories H + K + M: Deindex & Deindex + Indexing Interactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('IndexingEngine', () => {
  let engine: IndexingEngine;
  let clock: number;

  beforeEach(() => {
    engine = new IndexingEngine();
    clock = 1000;
    engine.now = () => clock;
  });

  // ─── Category H: Deindex Basics ───────────────────────────────────────

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

  // ─── Category K: Advanced Deindex ─────────────────────────────────────

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

    it('M6: deindex folder should remove all children — regression', () => {
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

  // ─── Category M: Deindex + Indexing Interactions ──────────────────────

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
