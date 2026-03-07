import { apiFetch } from '@/lib/api';
import { toResource } from '@/types/resource';

import type { PaginatedResponse } from '@/types/api';
import type { ConnectionResource, Resource } from '@/types/resource';

export type ChildResource = Resource & { parentId: string };

/**
 * Recursively fetches ALL descendants of a folder (files + subfolders at every level).
 * Each resource carries `parentId` — the resourceId of its immediate parent folder.
 */
export async function fetchFolderChildren(
  connectionId: string,
  folderId: string,
): Promise<ChildResource[]> {
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

  const resources: ChildResource[] = all.map((raw) => ({
    ...toResource(raw),
    parentId: folderId,
  }));
  // Intentional: unbounded recursion is acceptable here — Google Drive hierarchies
  // in this use-case are shallow (< 5 levels). A depth limit or concurrency throttle
  // would add complexity without real benefit for this scope.
  const subfolders = resources.filter((r) => r.type === 'folder');
  const nested = await Promise.all(
    subfolders.map((sf) => fetchFolderChildren(connectionId, sf.resourceId)),
  );

  return [...resources, ...nested.flat()];
}
