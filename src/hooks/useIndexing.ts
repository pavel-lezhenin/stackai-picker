'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useDeleteKBResource } from '@/hooks/useKnowledgeBase';
import { useIndexResources } from '@/hooks/useIndexResources';
import { fetchFolderChildren } from '@/lib/fetchFolderChildren';

import type { Resource, ResourceStatus, SubmittedEntry } from '@/types/resource';

/** KB API terminal success statuses — 'parsed' is the real status, 'indexed' for compatibility. */
function isKBDone(status: ResourceStatus): boolean {
  return status === 'indexed' || status === 'parsed';
}

/** After this duration, pending files that the server never confirmed are marked 'error'. */
const INDEXING_TIMEOUT_MS = 60 * 1000; // 1 minute

/** Recursively collects all file descendants under a folder by walking parentId links. */
function getFileDescendants(
  folderId: string,
  entries: Map<string, SubmittedEntry>,
): SubmittedEntry[] {
  const result: SubmittedEntry[] = [];
  for (const [id, entry] of entries) {
    if (id === folderId) continue; // skip self to prevent infinite recursion
    if (entry.parentId !== folderId) continue;
    if (entry.type === 'file') {
      result.push(entry);
    } else if (entry.type === 'folder') {
      result.push(...getFileDescendants(id, entries));
    }
  }
  return result;
}

/**
 * Manages indexing / de-indexing state with per-resourceId tracking.
 *
 * Key differences from the old localStatuses approach:
 *   - Tracks by resourceId (not name) → no cross-folder collisions
 *   - Never manually sets folders to 'indexed' → folder status is derived
 *   - isPendingIndex guards async gap during fetchFolderChildren
 *   - resolveFromKBData + timeout guarantee termination (no stuck 'pending')
 */
export function useIndexing(connectionId: string | undefined, orgId: string | undefined) {
  const [kbId, setKbId] = useState<string | undefined>(undefined);
  const [submittedIds, setSubmittedIds] = useState<Map<string, SubmittedEntry>>(new Map());
  const [isPendingIndex, setIsPendingIndex] = useState(false);

  // Accumulates all file Resources ever submitted — used to build the mutation
  // payload so rapid-fire indexing always includes previously-submitted files,
  // even before kbResources has refreshed.
  const allSubmittedResources = useRef<Map<string, Resource>>(new Map());

  // Monotonic counter to resolve race: only the LAST mutate call wins setKbId,
  // regardless of which HTTP response arrives first.
  const mutationSeqRef = useRef(0);

  const indexMutation = useIndexResources();
  const deleteMutation = useDeleteKBResource(kbId);

  /** True when any submitted file is still pending (drives polling guard). */
  const hasActiveJobs = useMemo(
    () => [...submittedIds.values()].some((e) => e.status === 'pending'),
    [submittedIds],
  );

  /**
   * Returns the display status for a resource based on submitted tracking.
   * - Files: direct lookup by resourceId
   * - Folders: derived from children that share the same jobRootId
   * - Unknown: returns null (not tracked)
   */
  const getDisplayStatus = useCallback(
    (resourceId: string): ResourceStatus => {
      const now = Date.now();

      const entry = submittedIds.get(resourceId);

      // File: direct lookup
      if (entry && entry.type === 'file') {
        if (entry.status === 'pending' && now - entry.submittedAt > INDEXING_TIMEOUT_MS) {
          return 'error';
        }
        return entry.status;
      }

      // Subfolder within a job: derive from file entries whose parentId matches
      if (entry && entry.type === 'folder') {
        const folderId = resourceId;
        const fileDescendants = getFileDescendants(folderId, submittedIds);
        const statuses = fileDescendants.map((e) => {
          if (e.status === 'pending' && now - e.submittedAt > INDEXING_TIMEOUT_MS) return 'error';
          return e.status;
        });
        console.log(`[getDisplayStatus] folder ${resourceId} (subfolder entry): descendants=${fileDescendants.length}, statuses=${JSON.stringify(statuses)}`);
        if (fileDescendants.length === 0) return 'pending';
        if (statuses.some((s) => s === 'pending')) return 'pending';
        if (statuses.some((s) => isKBDone(s))) return 'indexed';
        return 'error';
      }

      // Root folder (pseudo-entry was deleted): derive from children with matching jobRootId
      const children = [...submittedIds.values()].filter(
        (e) => e.jobRootId === resourceId && e.type === 'file',
      );
      console.log(`[getDisplayStatus] ${resourceId}: entry=${entry?.type ?? 'none'}, jobRootId children=${children.length}, statuses=${JSON.stringify(children.map(c => c.status))}`);
      if (children.length === 0) return null;

      const statuses = children.map((e) => {
        if (e.status === 'pending' && now - e.submittedAt > INDEXING_TIMEOUT_MS) return 'error';
        return e.status;
      });
      if (statuses.some((s) => s === 'pending')) return 'pending';
      if (statuses.some((s) => isKBDone(s))) return 'indexed';
      return 'error';
    },
    [submittedIds],
  );

  /**
   * Updates submitted entries from KB poll data.
   * Runs resolveTick logic: server 'indexed' → mark indexed,
   * all KB files indexed + absent → mark error (skipped),
   * timeout → mark error.
   */
  const resolveFromKBData = useCallback((kbResources: Resource[]) => {
    setSubmittedIds((prev) => {
      const kbFiles = kbResources.filter((r) => r.type === 'file');
      if (kbFiles.length === 0 && prev.size === 0) return prev;

      const kbStatusById = new Map(kbFiles.map((r) => [r.resourceId, r.status]));
      const kbStatusByName = new Map(kbFiles.map((r) => [r.name, r.status]));
      const allKBFilesIndexed =
        kbFiles.length > 0 && kbFiles.every((r) => isKBDone(r.status));
      const now = Date.now();

      let changed = false;
      const next = new Map(prev);

      for (const [id, entry] of next) {
        // Folder entries are always derived — skip them
        if (entry.type === 'folder') continue;
        if (entry.status !== 'pending') continue;

        // Rule 1: server confirmed done (by ID or name)
        const kbStatus = kbStatusById.get(id) ?? kbStatusByName.get(entry.name);
        if (kbStatus && isKBDone(kbStatus)) {
          next.set(id, { ...entry, status: 'indexed' });
          changed = true;
          continue;
        }

        // Rule 2: all KB files indexed + this file absent → skipped.
        // Scoped per job: only apply if KB contains at least one sibling
        // from the SAME job (jobRootId), proving the server started processing
        // this specific batch — not a different one.
        const jobSiblingInKB = [...prev].some(
          ([sibId, sib]) =>
            sibId !== id &&
            sib.jobRootId === entry.jobRootId &&
            sib.type === 'file' &&
            (kbStatusById.has(sibId) || kbStatusByName.has(sib.name)),
        );
        if (allKBFilesIndexed && jobSiblingInKB && !kbStatusById.has(id) && !kbStatusByName.has(entry.name)) {
          next.set(id, { ...entry, status: 'error' });
          changed = true;
          continue;
        }

        // Rule 3: timeout
        if (now - entry.submittedAt > INDEXING_TIMEOUT_MS) {
          next.set(id, { ...entry, status: 'error' });
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, []);

  /** Force-resolve any timed-out file entries (called periodically from useFileBrowser). */
  const resolveTimeouts = useCallback(() => {
    const now = Date.now();
    setSubmittedIds((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, entry] of next) {
        if (entry.type === 'folder') continue;
        if (entry.status === 'pending' && now - entry.submittedAt > INDEXING_TIMEOUT_MS) {
          next.set(id, { ...entry, status: 'error' });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  // --- Serialized indexing queue ---
  // Each handleIndex call enqueues work. Jobs run one at a time so that
  // allSubmittedResources ref is up-to-date for each subsequent KB creation.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const executeIndex = useCallback(
    async (resources: Resource[], kbResources: Resource[]) => {
      if (!connectionId || !orgId) return;
      if (resources.length === 0) return;

      setIsPendingIndex(true);
      const now = Date.now();

      // Build alreadyIndexed from BOTH kbResources AND our accumulated ref.
      const newIds = new Set(resources.map((r) => r.resourceId));
      const alreadyById = new Map<string, Resource>();
      for (const r of kbResources) {
        if ((isKBDone(r.status) || r.status === 'pending') && !newIds.has(r.resourceId)) {
          alreadyById.set(r.resourceId, r);
        }
      }
      for (const [id, r] of allSubmittedResources.current) {
        if (!newIds.has(id) && !alreadyById.has(id)) {
          alreadyById.set(id, r);
        }
      }
      const alreadyIndexed = [...alreadyById.values()];

      // Mark all resources as pending immediately
      setSubmittedIds((prev) => {
        const next = new Map(prev);
        for (const resource of resources) {
          next.set(resource.resourceId, {
            name: resource.name,
            type: resource.type === 'folder' ? 'folder' : 'file',
            parentId: resource.resourceId,
            status: 'pending',
            jobRootId: resource.resourceId,
            submittedAt: now,
          });
        }
        return next;
      });

      // Resolve all folders to their children in parallel
      const allNewFiles: Resource[] = [];
      const folderChildren = new Map<string, Awaited<ReturnType<typeof fetchFolderChildren>>>();

      try {
        const folders = resources.filter((r) => r.type === 'folder');
        const files = resources.filter((r) => r.type !== 'folder');
        allNewFiles.push(...files);

        if (folders.length > 0) {
          const results = await Promise.all(
            folders.map(async (f) => ({
              folderId: f.resourceId,
              folderName: f.name,
              children: await fetchFolderChildren(connectionId, f.resourceId),
            })),
          );

          for (const { folderId, folderName, children } of results) {
            folderChildren.set(folderId, children);
            const childFiles = children.filter((c) => c.type === 'file');
            if (childFiles.length === 0) {
              toast.info(`'${folderName}' is empty — skipped`);
            }
            allNewFiles.push(...childFiles);
          }
        }

        if (allNewFiles.length === 0) {
          toast.error('No files to index');
          setSubmittedIds((prev) => {
            const next = new Map(prev);
            for (const r of resources) next.delete(r.resourceId);
            return next;
          });
          setIsPendingIndex(false);
          return;
        }

        // Replace folder pseudo-entries with actual children
        setSubmittedIds((prev) => {
          const next = new Map(prev);
          for (const [folderId, children] of folderChildren) {
            next.delete(folderId);
            for (const child of children) {
              next.set(child.resourceId, {
                name: child.name,
                type: child.type,
                parentId: child.parentId,
                status: 'pending',
                jobRootId: folderId,
                submittedAt: now,
              });
            }
          }
          return next;
        });
      } catch {
        toast.error('Failed to load folder contents');
        setSubmittedIds((prev) => {
          const next = new Map(prev);
          for (const r of resources) next.delete(r.resourceId);
          return next;
        });
        setIsPendingIndex(false);
        return;
      }

      const allResources = [...alreadyIndexed, ...allNewFiles];

      // Track file resources for future calls
      for (const r of allNewFiles) {
        allSubmittedResources.current.set(r.resourceId, r);
      }

      const seq = ++mutationSeqRef.current;

      const label = resources.length === 1
        ? resources[0].type === 'folder'
          ? `Started indexing ${allNewFiles.length} files from '${resources[0].name}'`
          : `Started indexing '${resources[0].name}'`
        : `Started indexing ${allNewFiles.length} files from ${resources.length} items`;

      // Wrap mutate in a promise so the queue waits for completion
      await new Promise<void>((resolve) => {
        indexMutation.mutate(
          { connectionId, resources: allResources, orgId },
          {
            onSuccess: (kb) => {
              if (seq === mutationSeqRef.current) {
                setKbId(kb.knowledge_base_id);
              }
              setIsPendingIndex(false);
              toast.success(label);
              resolve();
            },
            onError: () => {
              setSubmittedIds((prev) => {
                const next = new Map(prev);
                for (const r of resources) next.delete(r.resourceId);
                for (const r of allNewFiles) next.delete(r.resourceId);
                return next;
              });
              setIsPendingIndex(false);
              resolve();
            },
          },
        );
      });
    },
    [connectionId, orgId, indexMutation],
  );

  /** Public API: enqueues resources for indexing. Multiple rapid calls are serialized. */
  const handleIndex = useCallback(
    (resources: Resource[], kbResources: Resource[]) => {
      // Show pending immediately for all resources
      const now = Date.now();
      setSubmittedIds((prev) => {
        const next = new Map(prev);
        for (const resource of resources) {
          next.set(resource.resourceId, {
            name: resource.name,
            type: resource.type === 'folder' ? 'folder' : 'file',
            parentId: resource.resourceId,
            status: 'pending',
            jobRootId: resource.resourceId,
            submittedAt: now,
          });
        }
        return next;
      });

      // Chain onto queue — each job waits for the previous one
      queueRef.current = queueRef.current.then(() => executeIndex(resources, kbResources));
    },
    [executeIndex],
  );

  const handleDeindex = useCallback(
    (resourceId: string, path: string) => {
      setSubmittedIds((prev) => {
        const next = new Map(prev);
        next.delete(resourceId);
        return next;
      });
      allSubmittedResources.current.delete(resourceId);
      deleteMutation.mutate(path);
    },
    [deleteMutation],
  );

  return {
    kbId,
    submittedIds,
    hasActiveJobs,
    isPendingIndex,
    isIndexing: indexMutation.isPending,
    isDeletePending: deleteMutation.isPending,
    getDisplayStatus,
    resolveFromKBData,
    resolveTimeouts,
    handleIndex,
    handleDeindex,
    deleteMutation,
  };
}
