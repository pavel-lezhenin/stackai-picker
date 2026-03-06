import { apiFetch } from '@/lib/api';
import { toResource } from '@/types/resource';

import type { PaginatedResponse } from '@/types/api';
import type { ConnectionResource, Resource } from '@/types/resource';

/**
 * Recursively fetches ALL descendants of a folder (files + subfolders at every level).
 * The backend processes individual files in parallel, whereas a single folder ID
 * is processed sequentially.
 */
export async function fetchFolderChildren(
  connectionId: string,
  folderId: string,
): Promise<Resource[]> {
  const all: ConnectionResource[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({ resource_id: folderId });
    if (cursor) params.set('cursor', cursor);
    const page = await apiFetch<PaginatedResponse<ConnectionResource>>(
      `/connections/${connectionId}/resources?${params}`,
    );
    all.push(...page.data);
    cursor = page.next_cursor ?? null;
  } while (cursor);

  const resources = all.map(toResource);
  const subfolders = resources.filter((r) => r.type === 'folder');
  const nested = await Promise.all(
    subfolders.map((sf) => fetchFolderChildren(connectionId, sf.resourceId)),
  );

  return [...resources, ...nested.flat()];
}
