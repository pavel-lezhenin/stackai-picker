import { useCallback, useMemo, useRef, useState } from 'react';

import type { Resource } from '@/types/resource';

export type SortField = 'name' | 'modified';
export type SortDirection = 'asc' | 'desc';
export type SortConfig = { field: SortField; direction: SortDirection };

const DEFAULT_SORT: SortConfig = { field: 'name', direction: 'asc' };

/**
 * Client-side sorting + text search for a resource list.
 * Folders always appear before files regardless of sort.
 * Sort preference persists across folder navigation (session-stable).
 */
export function useSortAndFilter(resources: Resource[]) {
  const [sort, setSort] = useState<SortConfig>(DEFAULT_SORT);
  const [searchQuery, setSearchQuery] = useState('');
  // Debounce timer ref for search input
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 200);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedQuery('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const toggleSort = useCallback((field: SortField) => {
    setSort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' },
    );
  }, []);

  const result = useMemo<Resource[]>(() => {
    // 1. Text filter
    const query = debouncedQuery.toLowerCase().trim();
    const filtered = query
      ? resources.filter((r) => r.name.toLowerCase().includes(query))
      : resources;

    // 2. Sort — folders first, then by selected field
    return [...filtered].sort((a, b) => {
      // Folders always first
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;

      const dir = sort.direction === 'asc' ? 1 : -1;

      if (sort.field === 'name') {
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) * dir;
      }

      // Modified date — nulls go last
      const aDate = a.modifiedAt ?? '';
      const bDate = b.modifiedAt ?? '';
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return aDate.localeCompare(bDate) * dir;
    });
  }, [resources, debouncedQuery, sort]);

  return {
    sortedResources: result,
    sort,
    toggleSort,
    searchQuery,
    debouncedQuery,
    handleSearchChange,
    clearSearch,
  };
}
