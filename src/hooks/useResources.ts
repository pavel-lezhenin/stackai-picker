'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { apiFetch } from '@/lib/api';
import { resourceKeys, toResource } from '@/types/resource';

import type { PaginatedResponse } from '@/types/api';
import type { ConnectionResource, Resource } from '@/types/resource';

/**
 * Fetches resources (files/folders) for a given connection and optional folder.
 * Transforms API shapes into internal Resource type.
 * Sorts: folders first, then files alphabetically.
 */
export function useResources(connectionId: string | undefined, folderId?: string) {
  const query = useQuery({
    queryKey: resourceKeys.list(connectionId ?? '', folderId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (folderId) params.set('resource_id', folderId);

      const url = `/connections/${connectionId}/resources${params.toString() ? `?${params}` : ''}`;
      return apiFetch<PaginatedResponse<ConnectionResource>>(url);
    },
    enabled: !!connectionId,
  });

  const resources: Resource[] = useMemo(() => {
    if (!query.data?.data) return [];

    return query.data.data.map(toResource).sort((a, b) => {
      // Folders first, then alphabetical
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [query.data]);

  return { ...query, resources };
}
