import { describe, expect, it, beforeEach } from 'vitest';

import { IndexingEngine } from '@/lib/IndexingEngine';

import { mkResource, mkKBFile, mkChildren } from './_helpers';

// ═══════════════════════════════════════════════════════════════════════════════
// Categories I + J: Mutation Sequences & Resolution Rules
// ═══════════════════════════════════════════════════════════════════════════════

describe('IndexingEngine', () => {
  let engine: IndexingEngine;
  let clock: number;

  beforeEach(() => {
    engine = new IndexingEngine();
    clock = 1000;
    engine.now = () => clock;
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
});
