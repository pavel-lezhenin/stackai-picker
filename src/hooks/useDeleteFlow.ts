'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useDeleteKBResource } from '@/hooks/useKnowledgeBase';
import { apiFetch } from '@/lib/api';
import { DELETE_ANIMATION_MS } from '@/lib/constants';
import { resourceKeys } from '@/types/resource';

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
  const queryClient = useQueryClient();

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

  // Batch delete bypasses the useMutation hook — calling mutate() in a synchronous
  // loop on a single useMutation causes each call to override the previous lifecycle
  // (onMutate/onError/onSettled), so only the last item actually gets deleted.
  // Direct parallel API calls with per-item rollback avoid the issue entirely.
  const handleBatchDelete = useCallback(
    async (items: { resourceId: string; path: string }[]) => {
      if (!kbId || items.length === 0) return;

      // Hide all items optimistically at once
      setHiddenResourceIds((prev) => {
        const next = new Set(prev);
        for (const item of items) next.add(item.resourceId);
        return next;
      });

      // Fire all deletes in parallel — each is independent
      const results = await Promise.allSettled(
        items.map((item) =>
          apiFetch<{ success: boolean }>(`/knowledge-bases/${kbId}/resources`, {
            method: 'DELETE',
            body: JSON.stringify({ resource_path: item.path }),
          }),
        ),
      );

      // Rollback individual failures
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          setHiddenResourceIds((prev) => {
            const next = new Set(prev);
            next.delete(items[i].resourceId);
            return next;
          });
          const name = items[i].path.split('/').pop() ?? items[i].path;
          toast.error(`Failed to remove '${name}'`);
        }
      });

      // Sync KB resource cache with server truth
      queryClient.invalidateQueries({ queryKey: resourceKeys.kbResources() });
    },
    [kbId, queryClient],
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
