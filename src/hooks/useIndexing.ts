'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useDeleteKBResource } from '@/hooks/useKnowledgeBase';
import { useIndexResources } from '@/hooks/useIndexResources';
import { IndexingEngine } from '@/lib/IndexingEngine';
import { fetchFolderChildren } from '@/lib/fetchFolderChildren';

import type { Resource, ResourceStatus, SubmittedEntry } from '@/types/resource';

/**
 * Manages indexing / de-indexing state with per-resourceId tracking.
 *
 * Delegates all pure state logic to IndexingEngine (testable, no React).
 * This hook handles:
 *   - React state synchronisation (setState after each engine mutation)
 *   - Async side effects (fetchFolderChildren, indexMutation)
 *   - Toast notifications
 *   - Serialized queue for rapid-fire mutations
 */
export function useIndexing(connectionId: string | undefined, orgId: string | undefined) {
  const engineRef = useRef(new IndexingEngine());

  // React state mirror of engine — drives re-renders
  const [submittedIds, setSubmittedIds] = useState<Map<string, SubmittedEntry>>(new Map());
  const [kbId, setKbId] = useState<string | undefined>(undefined);
  const [isPendingIndex, setIsPendingIndex] = useState(false);
  const [deindexedIds, setDeindexedIds] = useState<ReadonlySet<string>>(new Set());

  const indexMutation = useIndexResources();
  const deleteMutation = useDeleteKBResource(kbId);

  /** Flush engine state into React state. */
  const syncState = useCallback(() => {
    setSubmittedIds(engineRef.current.snapshot());
    setDeindexedIds(new Set(engineRef.current.deindexedIds));
    const engineKbId = engineRef.current.kbId;
    setKbId((prev) => (engineKbId !== prev ? engineKbId : prev));
  }, []);

  /** True when any submitted file is still pending (drives polling guard). */
  const hasActiveJobs = useMemo(
    () => [...submittedIds.values()].some((e) => e.status === 'pending'),
    [submittedIds],
  );

  /** Returns the display status for a resource. Delegates to engine. */
  const getDisplayStatus = useCallback(
    (resourceId: string): ResourceStatus => {
      return engineRef.current.getDisplayStatus(resourceId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [submittedIds],
  );

  /** Updates submitted entries from KB poll data. */
  const resolveFromKBData = useCallback(
    (kbResources: Resource[]) => {
      const changed = engineRef.current.resolveFromKBData(kbResources);
      if (changed) syncState();
    },
    [syncState],
  );

  /** Force-resolve any timed-out file entries. */
  const resolveTimeouts = useCallback(() => {
    const changed = engineRef.current.resolveTimeouts();
    if (changed) syncState();
  }, [syncState]);

  // --- Serialized indexing queue ---
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const executeIndex = useCallback(
    async (resources: Resource[], kbResources: Resource[]) => {
      if (!connectionId || !orgId) return;
      if (resources.length === 0) return;

      const engine = engineRef.current;
      setIsPendingIndex(true);

      // Build alreadyIndexed via engine (dedup across rapid-fire mutations)
      const newIds = new Set(resources.map((r) => r.resourceId));
      const alreadyIndexed = engine.buildAlreadyIndexed(kbResources, newIds);

      // Mark all resources as pending
      engine.markPending(resources);
      syncState();

      // Resolve all folders → children
      const allNewFiles: Resource[] = [];

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
            const childFiles = children.filter((c) => c.type === 'file');
            if (childFiles.length === 0) {
              toast.info(`'${folderName}' is empty — skipped`);
            }
            allNewFiles.push(...childFiles);

            // Expand folder in engine (replaces pseudo-entry with children)
            engine.expandFolder(
              folderId,
              children.map((c) => ({
                resourceId: c.resourceId,
                name: c.name,
                type: c.type,
                parentId: c.parentId,
              })),
            );
          }
        }

        if (allNewFiles.length === 0) {
          toast.error('No files to index');
          engine.removeEntries(resources.map((r) => r.resourceId));
          setIsPendingIndex(false);
          syncState();
          return;
        }

        syncState();
      } catch {
        toast.error('Failed to load folder contents');
        engine.removeEntries(resources.map((r) => r.resourceId));
        setIsPendingIndex(false);
        syncState();
        return;
      }

      const allResources = [...alreadyIndexed, ...allNewFiles];

      // Track file resources for future dedup
      engine.trackSubmittedFiles(allNewFiles);

      const seq = engine.nextMutationSeq();

      const label =
        resources.length === 1
          ? resources[0].type === 'folder'
            ? `Started indexing ${allNewFiles.length} files from '${resources[0].name}'`
            : `Started indexing '${resources[0].name}'`
          : `Started indexing ${allNewFiles.length} files from ${resources.length} items`;

      await new Promise<void>((resolve) => {
        indexMutation.mutate(
          { connectionId, resources: allResources, orgId },
          {
            onSuccess: (kb) => {
              engine.setKbIdIfLatest(seq, kb.knowledge_base_id);
              setIsPendingIndex(false);
              syncState();
              toast.success(label);
              resolve();
            },
            onError: () => {
              const idsToRemove = [
                ...resources.map((r) => r.resourceId),
                ...allNewFiles.map((r) => r.resourceId),
              ];
              engine.removeEntries(idsToRemove);
              setIsPendingIndex(false);
              syncState();
              resolve();
            },
          },
        );
      });
    },
    [connectionId, orgId, indexMutation, syncState],
  );

  /** Public API: enqueues resources for indexing. Multiple rapid calls are serialized. */
  const handleIndex = useCallback(
    (resources: Resource[], kbResources: Resource[]) => {
      // Show pending immediately
      engineRef.current.markPending(resources);
      syncState();

      // Chain onto queue — each job waits for the previous one
      queueRef.current = queueRef.current.then(() => executeIndex(resources, kbResources));
    },
    [executeIndex, syncState],
  );

  const handleDeindex = useCallback(
    (resourceId: string, path: string) => {
      engineRef.current.deindex(resourceId);
      syncState();
      deleteMutation.mutate(path);
    },
    [deleteMutation, syncState],
  );

  return {
    kbId,
    submittedIds,
    deindexedIds,
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
