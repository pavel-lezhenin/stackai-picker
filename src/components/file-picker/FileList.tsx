'use client';

import { useCallback, useEffect, useRef } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, FolderOpen, Search, X } from 'lucide-react';

import { FileRow } from '@/components/file-picker/FileRow';
import { FileListSkeleton } from '@/components/file-picker/FileListSkeleton';
import { Button } from '@/components/ui/button';

import type { SortConfig, SortField } from '@/hooks/useSortAndFilter';
import type { Resource } from '@/types/resource';

type FileListProps = {
  resources: Resource[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  deletingId?: string | null;
  pendingDeleteId?: string | null;
  indexedCount: number;
  totalCount: number;
  isIndexing: boolean;
  sort: SortConfig;
  searchQuery: string;
  debouncedQuery: string;
  onToggleSort: (field: SortField) => void;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onNavigate: (resourceId: string, name: string, path: string) => void;
  onDelete: (resourceId: string, name: string, path: string) => void;
  onIndex: (resource: Resource) => void;
  onDeindex: (path: string) => void;
  onRetry: () => void;
};

export function FileList({
  resources,
  isLoading,
  isError,
  errorMessage,
  deletingId,
  pendingDeleteId,
  indexedCount,
  totalCount,
  isIndexing,
  sort,
  searchQuery,
  debouncedQuery,
  onToggleSort,
  onSearchChange,
  onClearSearch,
  onNavigate,
  onDelete,
  onIndex,
  onDeindex,
  onRetry,
}: FileListProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search, Escape clears and blurs
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        onClearSearch();
        searchRef.current?.blur();
      }
    },
    [onClearSearch],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (isLoading) {
    return <FileListSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <div>
          <p className="text-sm font-medium">Failed to load files</p>
          <p className="text-xs text-muted-foreground mt-1">
            {errorMessage ?? 'An unexpected error occurred'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try Again
        </Button>
      </div>
    );
  }

  if (resources.length === 0 && !debouncedQuery) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <FolderOpen className="h-10 w-10 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium">No files found</p>
          <p className="text-xs text-muted-foreground mt-1">This folder is empty</p>
        </div>
      </div>
    );
  }

  return (
    <div role="grid" aria-label="File list">
      {/* Search bar — always visible when totalCount > 0 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          ref={searchRef}
          type="text"
          placeholder="Search files… (press / to focus)"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          aria-label="Search files"
        />
        {searchQuery && (
          <button
            onClick={onClearSearch}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Sortable column headers */}
      <div
        role="row"
        className="grid grid-cols-[1fr_100px_120px_136px] items-center gap-4 px-4 py-2 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide"
      >
        <div
          role="columnheader"
          className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors"
          onClick={() => onToggleSort('name')}
          aria-sort={
            sort.field === 'name' ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
          }
        >
          Name
          <SortIndicator field="name" sort={sort} />
        </div>
        <div role="columnheader">Status</div>
        <div
          role="columnheader"
          className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors"
          onClick={() => onToggleSort('modified')}
          aria-sort={
            sort.field === 'modified'
              ? sort.direction === 'asc'
                ? 'ascending'
                : 'descending'
              : 'none'
          }
        >
          Modified
          <SortIndicator field="modified" sort={sort} />
        </div>
        <div role="columnheader" className="text-right pr-1">
          <span
            aria-live="polite"
            className="normal-case tracking-normal font-normal text-muted-foreground/70"
          >
            {indexedCount > 0
              ? `${indexedCount} of ${totalCount} indexed`
              : `${totalCount} item${totalCount !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* Empty search results — search bar stays visible above */}
      {resources.length === 0 && debouncedQuery && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Search className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium">
              No results matching &lsquo;{debouncedQuery}&rsquo;
            </p>
            <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
          </div>
          <Button variant="outline" size="sm" onClick={onClearSearch}>
            Clear Search
          </Button>
        </div>
      )}

      {/* Rows */}
      {resources.length > 0 && (
        <div className="transition-opacity duration-200">
          {resources.map((resource) => (
            <FileRow
              key={resource.resourceId}
              resourceId={resource.resourceId}
              name={resource.name}
              type={resource.type}
              status={resource.status}
              modifiedAt={resource.modifiedAt}
              path={resource.path}
              searchHighlight={debouncedQuery}
              isDeleting={deletingId === resource.resourceId}
              isPendingDelete={pendingDeleteId === resource.resourceId}
              isIndexing={isIndexing && resource.status === 'pending'}
              onNavigate={onNavigate}
              onDelete={onDelete}
              onIndex={onIndex}
              onDeindex={onDeindex}
              resource={resource}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SortIndicator({ field, sort }: { field: SortField; sort: SortConfig }) {
  if (sort.field !== field) return null;
  return sort.direction === 'asc' ? (
    <ArrowUp className="h-3 w-3" />
  ) : (
    <ArrowDown className="h-3 w-3" />
  );
}
