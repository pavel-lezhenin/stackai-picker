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

  // Use mutateAsync + Promise.allSettled so all deletions run concurrently.
  // Optimistic hides are applied up-front; each item rolls back independently on error.
  // Error toasts are handled by useDeleteKBResource's onError — catch only unwinds local state.
  const handleBatchDelete = useCallback(
    async (items: { resourceId: string; path: string }[]) => {
      setHiddenResourceIds((prev) => new Set([...prev, ...items.map((item) => item.resourceId)]));

      await Promise.allSettled(
        items.map(async (item) => {
          try {
            await deleteMutation.mutateAsync(item.path);
          } catch {
            setHiddenResourceIds((prev) => {
              const next = new Set(prev);
              next.delete(item.resourceId);
              return next;
            });
          }
        }),
      );
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
