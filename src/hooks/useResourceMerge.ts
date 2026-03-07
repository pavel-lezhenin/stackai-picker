import { useCallback, useMemo, useState } from 'react';

import type { Resource, ResourceStatus } from '@/types/resource';

export type StatusFilter = 'all' | 'indexed' | 'not-indexed';

/**
 * Merges connection resources with KB status + per-resourceId display overrides,
 * applies a visibility filter, and computes counts.
 *
 * Merge rule (ISS-11 fix):
 *  - Server 'indexed' always wins (confirmed by KB)
 *  - If tracked by getDisplayStatus → show tracked status (pending/error)
 *  - Otherwise → server status
 */
export function useResourceMerge(
  connectionResources: Resource[],
  kbResources: Resource[],
  hiddenResourceIds: ReadonlySet<string>,
  getDisplayStatus: (resourceId: string) => ResourceStatus,
) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const resources = useMemo<Resource[]>(() => {
    const statusById = new Map(kbResources.map((r) => [r.resourceId, r.status]));
    const statusByName = new Map(kbResources.map((r) => [r.name, r.status]));

    return connectionResources
      .filter((r) => !hiddenResourceIds.has(r.resourceId))
      .map((r) => {
        const serverStatus = statusById.get(r.resourceId) ?? statusByName.get(r.name) ?? r.status;
        // Server confirmed done always wins — no local override can contradict it
        if (serverStatus === 'indexed' || serverStatus === 'parsed') return { ...r, status: 'indexed' as const };

        const displayStatus = getDisplayStatus(r.resourceId);
        const status = displayStatus ?? serverStatus;
        return { ...r, status };
      });
  }, [connectionResources, kbResources, hiddenResourceIds, getDisplayStatus]);

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
