'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { useDeleteKBResource } from '@/hooks/useKnowledgeBase';
import { DELETE_ANIMATION_MS } from '@/lib/constants';

type DeleteTarget = {
  resourceId: string;
  name: string;
  path: string;
};

/**
 * Encapsulates the full delete flow:
 * confirmation dialog state, exit animation, optimistic hiding, and rollback.
 */
export function useDeleteFlow(kbId: string | undefined) {
  const deleteMutation = useDeleteKBResource(kbId);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hiddenResourceIds, setHiddenResourceIds] = useState<ReadonlySet<string>>(new Set());

  const handleDelete = useCallback((resourceId: string, name: string, path: string) => {
    setDeleteTarget({ resourceId, name, path });
  }, []);

  const handleDeleteCancel = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setDeletingId(target.resourceId);

    // Brief delay lets the exit animation play before the row disappears from DOM
    await new Promise<void>((r) => setTimeout(r, DELETE_ANIMATION_MS));
    setDeletingId(null);
    setHiddenResourceIds((prev) => new Set([...prev, target.resourceId]));

    deleteMutation.mutate(target.path, {
      onError: () => {
        // Reverse the optimistic hide — bring the row back
        setHiddenResourceIds((prev) => {
          const next = new Set(prev);
          next.delete(target.resourceId);
          return next;
        });
        toast.error(`Failed to remove '${target.name}'`);
      },
    });
  }, [deleteTarget, deleteMutation]);

  // Intentional: individual mutate() calls per item. Each deletion has its own
  // optimistic hide + independent rollback on error — a single mutateAsync/Promise.all
  // would make rollback all-or-nothing, worse UX for partial failures.
  const handleBatchDelete = useCallback(
    (items: { resourceId: string; path: string }[]) => {
      for (const item of items) {
        setHiddenResourceIds((prev) => new Set([...prev, item.resourceId]));
        deleteMutation.mutate(item.path, {
          onError: () => {
            setHiddenResourceIds((prev) => {
              const next = new Set(prev);
              next.delete(item.resourceId);
              return next;
            });
          },
        });
      }
    },
    [deleteMutation],
  );

  return {
    deleteTarget,
    deletingId,
    hiddenResourceIds,
    isDeletePending: deleteMutation.isPending,
    handleDelete,
    handleDeleteCancel,
    handleDeleteConfirm,
    handleBatchDelete,
    deleteMutation,
  };
}
