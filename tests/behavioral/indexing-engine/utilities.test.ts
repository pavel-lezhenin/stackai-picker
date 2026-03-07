import { describe, expect, it } from 'vitest';

import { isKBDone, getFileDescendants } from '@/lib/IndexingEngine';

import type { SubmittedEntry } from '@/types/resource';

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
