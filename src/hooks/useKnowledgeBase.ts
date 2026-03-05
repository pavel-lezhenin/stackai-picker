'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import { resourceKeys } from '@/types/resource';

import type { KnowledgeBase } from '@/types/api';
import type { Resource } from '@/types/resource';

// --- Create Knowledge Base ---

export function useCreateKB() {
  return useMutation({
    mutationFn: (params: { connectionId: string; resourceIds: string[] }) =>
      apiFetch<KnowledgeBase>('/knowledge-bases', {
        method: 'POST',
        body: JSON.stringify({
          connection_id: params.connectionId,
          connection_source_ids: params.resourceIds,
        }),
      }),
    onSuccess: () => {
      toast.success('Knowledge Base created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create Knowledge Base: ${error.message}`);
    },
  });
}

// --- Sync Knowledge Base ---

export function useSyncKB() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { kbId: string; orgId: string }) => {
      const qs = new URLSearchParams({ org_id: params.orgId });
      return apiFetch<unknown>(`/knowledge-bases/${params.kbId}/sync?${qs}`);
    },
    onSuccess: (_data, variables) => {
      toast.success('Indexing started — files will be indexed shortly');
      // Invalidate KB resources to pick up status changes on next fetch
      queryClient.invalidateQueries({
        queryKey: resourceKeys.kbResources(),
      });
    },
    onError: (error: Error) => {
      toast.error(`Failed to start indexing: ${error.message}`);
    },
  });
}

// --- Delete KB Resource (with optimistic update) ---

export function useDeleteKBResource(kbId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (resourcePath: string) =>
      apiFetch<{ success: boolean }>(`/knowledge-bases/${kbId}/resources`, {
        method: 'DELETE',
        body: JSON.stringify({ resource_path: resourcePath }),
      }),

    onMutate: async (resourcePath) => {
      // Cancel outgoing queries for this KB
      await queryClient.cancelQueries({
        queryKey: resourceKeys.kbResources(),
      });

      // Snapshot all KB resource queries for rollback
      const previousData = queryClient.getQueriesData({
        queryKey: resourceKeys.kbResources(),
      });

      // Optimistically remove from all matching queries
      queryClient.setQueriesData({ queryKey: resourceKeys.kbResources() }, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        const data = old as { data: Resource[] };
        if (!Array.isArray(data.data)) return old;
        return {
          ...data,
          data: data.data.filter((r: Resource) => r.path !== resourcePath),
        };
      });

      return { previousData };
    },

    onError: (error: Error, _resourcePath, context) => {
      // Rollback to snapshot
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      toast.error(`Failed to remove resource: ${error.message}`);
    },

    onSettled: () => {
      // Sync with server truth
      queryClient.invalidateQueries({
        queryKey: resourceKeys.kbResources(),
      });
    },

    onSuccess: (_data, resourcePath) => {
      const name = resourcePath.split('/').pop() ?? resourcePath;
      toast.success(`Removed '${name}' from Knowledge Base`);
    },
  });
}
