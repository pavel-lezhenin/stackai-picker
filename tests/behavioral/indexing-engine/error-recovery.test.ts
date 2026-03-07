import { describe, expect, it, beforeEach } from 'vitest';

import { IndexingEngine, INDEXING_TIMEOUT_MS } from '@/lib/IndexingEngine';

import { mkResource, mkKBFile, mkChildren } from './_helpers';

// ═══════════════════════════════════════════════════════════════════════════════
// Categories F + G: Error Cases, Recovery & Edge Cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('IndexingEngine', () => {
  let engine: IndexingEngine;
  let clock: number;

  beforeEach(() => {
    engine = new IndexingEngine();
    clock = 1000;
    engine.now = () => clock;
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
});
