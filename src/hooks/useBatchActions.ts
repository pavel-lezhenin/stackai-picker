'use client';

import { useCallback, useMemo } from 'react';

import type { useIndexing } from '@/hooks/useIndexing';
import type { Resource } from '@/types/resource';

type UseBatchActionsParams = {
  /** Pass the return value of useIndexing — keeps kbId in a single state instance */
  indexing: ReturnType<typeof useIndexing>;
  selectedResources: Resource[];
  kbResources: Resource[];
  onBatchDelete: (items: { resourceId: string; path: string }[]) => void;
  clearSelection: () => void;
};

/** Encapsulates batch (multi-select) action logic. Accepts indexing hook values externally
 *  so that kbId lives in exactly one place (FileBrowser) and can be shared with useDeleteFlow. */
export function useBatchActions({
  indexing,
  selectedResources,
  kbResources,
  onBatchDelete,
  clearSelection,
}: UseBatchActionsParams) {
  const canBatchIndex = useMemo(
    () => selectedResources.some((r) => r.status === null || r.status === 'resource'),
    [selectedResources],
  );
  const canBatchDeindex = useMemo(
    () => selectedResources.some((r) => r.status === 'indexed'),
    [selectedResources],
  );
  const canBatchDelete = useMemo(
    () => selectedResources.some((r) => r.type !== 'folder' && r.status === 'indexed'),
    [selectedResources],
  );

  const handleIndex = useCallback(
    (resource: Resource) => indexing.handleIndex(resource, kbResources),
    [indexing, kbResources],
  );

  const handleBatchIndex = useCallback(() => {
    for (const r of selectedResources) {
      if (r.status === null || r.status === 'resource') {
        indexing.handleIndex(r, kbResources);
      }
    }
    clearSelection();
  }, [selectedResources, indexing, kbResources, clearSelection]);

  const handleBatchDeindex = useCallback(() => {
    for (const r of selectedResources) {
      if (r.status === 'indexed') {
        indexing.handleDeindex(r.path);
      }
    }
    clearSelection();
  }, [selectedResources, indexing, clearSelection]);

  const handleBatchDeleteAction = useCallback(() => {
    const targets = selectedResources
      .filter((r) => r.type !== 'folder' && r.status === 'indexed')
      .map((r) => ({ resourceId: r.resourceId, path: r.path }));
    onBatchDelete(targets);
    clearSelection();
  }, [selectedResources, onBatchDelete, clearSelection]);

  return {
    ...indexing,
    handleIndex,
    canBatchIndex,
    canBatchDeindex,
    canBatchDelete,
    handleBatchIndex,
    handleBatchDeindex,
    handleBatchDelete: handleBatchDeleteAction,
  };
}
