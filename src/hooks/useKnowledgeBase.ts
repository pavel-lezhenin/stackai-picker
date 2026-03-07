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

/** Fetches KB resources at a path, paginates, then recurses into directories. */
async function fetchKBResourcesRecursive(
  kbId: string,
  resourcePath: string,
): Promise<KBResource[]> {
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

  // Recurse into directories to get nested files
  const dirs = all.filter((r) => r.inode_type === 'directory');
  const nested = await Promise.all(
    dirs.map((d) => {
      const name = d.inode_path.path.split('/').pop() ?? d.inode_path.path;
      const subPath = resourcePath === '/' ? `/${name}` : `${resourcePath}/${name}`;
      return fetchKBResourcesRecursive(kbId, subPath);
    }),
  );

  return [...all, ...nested.flat()];
}

/**
 * Fetches all pages of KB resources with indexed status.
 * Polls every 1s while any resource is in "pending" status or the list is
 * empty — stops automatically once all resources reach a terminal state.
 */
export function useKBResources(
  kbId: string | undefined,
  resourcePath: string = '/',
  hasActiveJobs: boolean = false,
) {
  // KB API requires resource_path to start with '/'
  const normalizedPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
  return useQuery({
    queryKey: resourceKeys.kbResourceList(kbId ?? '', normalizedPath),
    queryFn: async (): Promise<KBResource[]> => {
      return fetchKBResourcesRecursive(kbId!, normalizedPath);
    },
    enabled: !!kbId,
    staleTime: 5 * 60 * 1000,
    // Auto-poll while resources are being indexed.
    // Guard: only poll on empty data when there are active indexing jobs —
    // prevents infinite polling on paths that will never get KB resources.
    // Stop when every resource has reached 'indexed'.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      if (data.length === 0) return hasActiveJobs ? 1000 : false;
      const files = data.filter((r) => r.inode_type === 'file');
      if (files.length === 0) return hasActiveJobs ? 1000 : false;
      return files.every((r) => r.status === 'indexed' || r.status === 'parsed') ? false : 1000;
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
