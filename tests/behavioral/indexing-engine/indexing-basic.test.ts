import { describe, expect, it, beforeEach } from 'vitest';

import { IndexingEngine } from '@/lib/IndexingEngine';

import { mkResource, mkKBFile, mkChildren } from './_helpers';

// ═══════════════════════════════════════════════════════════════════════════════
// Categories A + B: Single Resource Indexing & Display Status
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
});
