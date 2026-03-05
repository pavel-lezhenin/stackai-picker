'use client';

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import { resourceKeys, toResource } from '@/types/resource';

import type { ConnectionResource, Resource } from '@/types/resource';
import type { PaginatedResponse } from '@/types/api';

/**
 * Fetches all pages of resources for a given connection and optional folder.
 * Uses TanStack Query `select` to transform API shapes into sorted Resource type.
 * Folders appear first, then files alphabetically.
 * Handles cursor pagination — fetches all pages before resolving.
 */
export function useResources(connectionId: string | undefined, folderId?: string) {
  return useQuery({
    queryKey: resourceKeys.list(connectionId ?? '', folderId),
    queryFn: async (): Promise<ConnectionResource[]> => {
      const all: ConnectionResource[] = [];
      let cursor: string | null = null;

      do {
        const params = new URLSearchParams();
        if (folderId) params.set('resource_id', folderId);
        if (cursor) params.set('cursor', cursor);

        const url = `/connections/${connectionId}/resources${params.size ? `?${params}` : ''}`;
        const page = await apiFetch<PaginatedResponse<ConnectionResource>>(url);
        all.push(...page.data);
        cursor = page.next_cursor ?? null;
      } while (cursor);

      return all;
    },
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000,
    // Transform raw API shapes → sorted Resource[] once, memoized by TanStack Query
    select: (data): Resource[] =>
      data.map(toResource).sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
  });
}
