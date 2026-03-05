import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Cancels in-flight queries matching `queryKey`, snapshots the current cached
 * data, and applies `updater` optimistically. Returns a context for rollback.
 *
 * Usage pattern (DRY across all mutations):
 *   onMutate  → `prepareOptimisticUpdate(...)`
 *   onError   → `rollbackOptimisticUpdate(...)` + toast
 *   onSettled → `queryClient.invalidateQueries(...)`
 */
export async function prepareOptimisticUpdate<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updater: (prev: TData) => TData,
): Promise<{ previousData: [QueryKey, TData | undefined][] }> {
  await queryClient.cancelQueries({ queryKey });

  const previousData = queryClient.getQueriesData<TData>({ queryKey });

  queryClient.setQueriesData<TData>({ queryKey }, (old) => {
    if (old === undefined) return old;
    return updater(old);
  });

  return { previousData };
}

/** Restores all queries that were snapshotted before an optimistic update. */
export function rollbackOptimisticUpdate<TData>(
  queryClient: QueryClient,
  previousData: [QueryKey, TData | undefined][],
): void {
  for (const [key, data] of previousData) {
    queryClient.setQueryData(key, data);
  }
}
