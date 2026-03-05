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
 * Polls every 3s while any resource is in "pending" status — stops automatically
 * once all resources reach a terminal state (indexed / resource).
 */
export function useKBResources(kbId: string | undefined, resourcePath: string = '/') {
  return useQuery({
    queryKey: resourceKeys.kbResourceList(kbId ?? '', resourcePath),
    queryFn: async (): Promise<KBResource[]> => {
      const all: KBResource[] = [];
      let cursor: string | null = null;

      do {
        const params = new URLSearchParams({ resource_path: resourcePath });
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
    // Auto-poll while any resource is still being indexed
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return data.some((r) => r.status === 'pending') ? 3000 : false;
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
      return apiFetch<KnowledgeBase>('/knowledge-bases', {
        method: 'POST',
        body: JSON.stringify({
          connection_id: params.connectionId,
          connection_source_ids: connectionSourceIds,
          indexing_params: {
            ocr: false,
            unstructured: true,
            embedding_params: { embedding_model: 'text-embedding-ada-002', api_key: null },
            chunker_params: { chunk_size: 1500, chunk_overlap: 500, chunker: 'sentence' },
          },
          org_level_role: null,
          cron_job_id: null,
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
      return apiFetch<unknown>(`/knowledge-bases/${params.kbId}/sync?${qs}`);
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
      // Optimistically remove the resource from all KB resource lists
      return prepareOptimisticUpdate<Resource[]>(queryClient, resourceKeys.kbResources(), (prev) =>
        prev.filter((r) => r.path !== resourcePath),
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

// --- Index Resources (create KB + trigger sync in one shot) ---

/**
 * Creates a new Knowledge Base with the given resources and immediately triggers
 * a sync. Returns the KB object (including knowledge_base_id) on success.
 *
 * Each call creates a NEW KB — to keep previously indexed items, callers must
 * include those resources in the `resources` array alongside new selections.
 */
export function useIndexResources() {
  return useMutation({
    mutationFn: async (params: { connectionId: string; resources: Resource[]; orgId: string }) => {
      const connectionSourceIds = deduplicateForIndexing(params.resources);

      const kb = await apiFetch<KnowledgeBase>('/knowledge-bases', {
        method: 'POST',
        body: JSON.stringify({
          connection_id: params.connectionId,
          connection_source_ids: connectionSourceIds,
        }),
      });

      const qs = new URLSearchParams({ org_id: params.orgId });
      await apiFetch<unknown>(`/knowledge-bases/${kb.knowledge_base_id}/sync?${qs}`);

      return kb;
    },

    onError: (error: Error) => {
      toast.error(`Failed to index: ${error.message}`);
    },

    onSuccess: (_data, variables) => {
      const count = variables.resources.length;
      toast.success(
        `Indexing ${count} ${count === 1 ? 'item' : 'items'} — status updates automatically`,
      );
    },
  });
}
