import { useCallback, useMemo, useState } from 'react';

import type { Resource, ResourceStatus } from '@/types/resource';

export type StatusFilter = 'all' | 'indexed' | 'not-indexed';

/** Indexing lifecycle priority — higher = further along. */
function statusPriority(s: ResourceStatus): number {
  if (s === 'indexed') return 3;
  if (s === 'pending') return 2;
  if (s === 'resource') return 1;
  return 0; // null
}

/**
 * Merges connection resources with KB status + optimistic local overrides,
 * applies a visibility filter, and computes counts.
 *
 * Merge rule: take whichever status is further along the indexing lifecycle
 * (indexed > pending > resource > null). This handles every transition cleanly:
 *  - local 'pending' + server null → pending (server hasn't caught up)
 *  - local 'pending' + server 'indexed' → indexed (server confirmed)
 *  - local 'indexed' + server 'pending' → indexed (suppress flicker)
 */
export function useResourceMerge(
  connectionResources: Resource[],
  kbResources: Resource[],
  hiddenResourceIds: ReadonlySet<string>,
  localStatuses: Map<string, ResourceStatus>,
) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const resources = useMemo<Resource[]>(() => {
    const statusById = new Map(kbResources.map((r) => [r.resourceId, r.status]));
    const statusByName = new Map(kbResources.map((r) => [r.name, r.status]));

    return connectionResources
      .filter((r) => !hiddenResourceIds.has(r.resourceId))
      .map((r) => {
        const serverStatus = statusById.get(r.resourceId) ?? statusByName.get(r.name) ?? r.status;
        const localStatus = localStatuses.get(r.name);
        const status =
          localStatus !== undefined && statusPriority(localStatus) > statusPriority(serverStatus)
            ? localStatus
            : serverStatus;
        return { ...r, status };
      });
  }, [connectionResources, kbResources, hiddenResourceIds, localStatuses]);

  const indexedCount = useMemo(
    () => resources.filter((r) => r.status === 'indexed').length,
    [resources],
  );

  const filteredResources = useMemo<Resource[]>(() => {
    if (statusFilter === 'all') return resources;
    if (statusFilter === 'indexed') return resources.filter((r) => r.status === 'indexed');
    return resources.filter((r) => r.status === null || r.status === 'resource');
  }, [resources, statusFilter]);

  const resetFilter = useCallback(() => setStatusFilter('all'), []);

  return {
    resources,
    filteredResources,
    indexedCount,
    statusFilter,
    setStatusFilter,
    resetFilter,
  };
}
