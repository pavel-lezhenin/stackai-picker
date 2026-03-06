'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api';
import { prepareOptimisticUpdate, rollbackOptimisticUpdate } from '@/lib/optimistic';
import { deduplicateForIndexing, resourceKeys, toResource } from '@/types/resource';

import type { KnowledgeBase } from '@/types/api';
import type { KBResource, Resource } from '@/types/resource';
import type { PaginatedResponse } from '@/types/api';

// --- List Knowledge Base Resources ---

/**
 * Fetches all pages of KB resources with indexed status.
 * Polls every 1s while any resource is in "pending" status or the list is
 * empty — stops automatically once all resources reach a terminal state.
 */
export function useKBResources(kbId: string | undefined, resourcePath: string = '/') {
  // KB API requires resource_path to start with '/'
  const normalizedPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
  return useQuery({
    queryKey: resourceKeys.kbResourceList(kbId ?? '', normalizedPath),
    queryFn: async (): Promise<KBResource[]> => {
      const all: KBResource[] = [];
      let cursor: string | null = null;

      do {
        const params = new URLSearchParams({ resource_path: normalizedPath });
        if (cursor) params.set('cursor', cursor);

        const page = await apiFetch<PaginatedResponse<KBResource>>(
          `/knowledge-bases/${kbId}/resources?${params}`,
        );
        all.push(...page.data);
        cursor = page.next_cursor ?? null;
      } while (cursor);

      return all;
    },
    enabled: !!kbId,
    staleTime: 5 * 60 * 1000,
    // Auto-poll while resources are being indexed.
    // Also poll when the list is empty — the KB may not list resources immediately
    // after sync/trigger fires (async server-side processing takes a moment).
    // Stop ONLY when every resource has reached 'indexed' — checking for 'pending'
    // alone misses undocumented transitional states the API may return (e.g. 'resource',
    // 'queued', 'processing'). This covers the full documented + undocumented lifecycle.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      if (data.length === 0) return 1000;
      return data.every((r) => r.status === 'indexed') ? false : 1000;
    },
    select: (data): Resource[] =>
      data.map(toResource).sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
  });
}

// --- Create Knowledge Base ---

export function useCreateKB() {
  return useMutation({
    /**
     * Accepts a resource selection and deduplicates before creating the KB:
     * if a folder is selected alongside its children, only the folder is sent
     * to avoid duplicate indexing work on the server.
     */
    mutationFn: (params: { connectionId: string; resources: Resource[] }) => {
      const connectionSourceIds = deduplicateForIndexing(params.resources);
      // BFF owns indexing_params — client only sends resource identifiers
      return apiFetch<KnowledgeBase>('/knowledge-bases', {
        method: 'POST',
        body: JSON.stringify({
          connection_id: params.connectionId,
          connection_source_ids: connectionSourceIds,
        }),
      });
    },
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
      return apiFetch<unknown>(`/knowledge-bases/${params.kbId}/sync?${qs}`, { method: 'POST' });
    },
    onSuccess: () => {
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

export function useDeleteKBResource(kbId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (resourcePath: string) => {
      if (!kbId) throw new Error('No Knowledge Base selected. Index files first.');
      return apiFetch<{ success: boolean }>(`/knowledge-bases/${kbId}/resources`, {
        method: 'DELETE',
        body: JSON.stringify({ resource_path: resourcePath }),
      });
    },

    onMutate: async (resourcePath) => {
      // Optimistically remove the resource from all KB resource lists.
      // Cache holds raw KBResource[] (pre-select), so filter on inode_path.path.
      return prepareOptimisticUpdate<KBResource[]>(
        queryClient,
        resourceKeys.kbResources(),
        (prev) => prev.filter((r) => r.inode_path.path !== resourcePath),
      );
    },

    onError: (error: Error, _resourcePath, context) => {
      if (context) rollbackOptimisticUpdate(queryClient, context.previousData);
      toast.error(`Failed to remove resource: ${error.message}`);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: resourceKeys.kbResources() });
    },

    onSuccess: (_data, resourcePath) => {
      const name = resourcePath.split('/').pop() ?? resourcePath;
      toast.success(`Removed '${name}' from Knowledge Base`);
    },
  });
}
