'use client';

import { useCallback, useMemo } from 'react';

import { useIndexing } from '@/hooks/useIndexing';

import type { Resource } from '@/types/resource';

type UseBatchActionsParams = {
  connectionId: string | undefined;
  orgId: string | undefined;
  selectedResources: Resource[];
  kbResources: Resource[];
  onBatchDelete: (items: { resourceId: string; path: string }[]) => void;
  clearSelection: () => void;
};

/** Encapsulates all batch (multi-select) action logic and the indexing hook. */
export function useBatchActions({
  connectionId,
  orgId,
  selectedResources,
  kbResources,
  onBatchDelete,
  clearSelection,
}: UseBatchActionsParams) {
  const indexing = useIndexing(connectionId, orgId);

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
