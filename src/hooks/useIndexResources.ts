'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { deduplicateForIndexing, resourceKeys } from '@/types/resource';
import { toast } from 'sonner';

import type { KnowledgeBase } from '@/types/api';
import type { KBResource, Resource } from '@/types/resource';

/**
 * Creates a new Knowledge Base with the given resources and immediately triggers
 * a sync. Returns the KB object (including knowledge_base_id) on success.
 *
 * Each call creates a NEW KB — to keep previously indexed items, callers must
 * include those resources in the `resources` array alongside new selections.
 */
export function useIndexResources() {
  const queryClient = useQueryClient();

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

      // Fire-and-forget: don't await sync — it starts a background job anyway.
      // Waiting for the response adds 1-3s to mutation time with zero benefit;
      // the polling in useKBResources picks up status changes regardless.
      const qs = new URLSearchParams({ org_id: params.orgId });
      apiFetch<unknown>(`/knowledge-bases/${kb.knowledge_base_id}/sync?${qs}`, {
        method: 'POST',
      }).catch(() => {
        // Sync failure is non-fatal here — the KB was created successfully.
        // The user will see resources stuck in 'pending' and can retry.
      });

      return kb;
    },

    onSuccess: (kb, params) => {
      // Prime the cache with pending resources immediately so the UI reflects the
      // new state without a loading flash while waiting for the first poll cycle.
      const pendingResources: KBResource[] = params.resources.map((r) => ({
        resource_id: r.resourceId,
        inode_type: r.type === 'folder' ? ('directory' as const) : ('file' as const),
        inode_path: { path: r.path },
        status: 'pending',
        created_at: null,
        modified_at: r.modifiedAt,
      }));
      queryClient.setQueryData(
        resourceKeys.kbResourceList(kb.knowledge_base_id, '/'),
        pendingResources,
      );
      queryClient.invalidateQueries({ queryKey: resourceKeys.kbResources() });
    },

    onError: (error: Error) => {
      toast.error(`Failed to index: ${error.message}`);
    },
  });
}
