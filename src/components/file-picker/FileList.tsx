'use client';

import { AlertTriangle, Search } from 'lucide-react';

import { ColumnHeaders } from '@/components/file-picker/ColumnHeaders';
import { useDragSelect } from '@/hooks/useDragSelect';
import { FileRow } from '@/components/file-picker/FileRow';
import { FileListSkeleton } from '@/components/file-picker/FileListSkeleton';
import { SearchBar } from '@/components/file-picker/SearchBar';
import { SelectionToolbar } from '@/components/file-picker/SelectionToolbar';
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
  selected: ReadonlySet<string>;
  allSelected: boolean;
  someSelected: boolean;
  selectionCount: number;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onSelectAll: () => void;
  onToggleSort: (field: SortField) => void;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onNavigate: (resourceId: string, name: string, path: string) => void;
  onDelete: (resourceId: string, name: string, path: string) => void;
  onIndex: (resource: Resource) => void;
  onDeindex: (path: string) => void;
  onRetry: () => void;
  onBatchIndex: () => void;
  onBatchDeindex: () => void;
  onBatchDelete: () => void;
  canBatchIndex: boolean;
  canBatchDeindex: boolean;
  canBatchDelete: boolean;
  hasSelectable: boolean;
  onDragSelect: (ids: string[]) => void;
  onClearSelection: () => void;
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
  selected,
  allSelected,
  someSelected,
  selectionCount,
  onToggleSelect,
  onSelectAll,
  onToggleSort,
  onSearchChange,
  onClearSearch,
  onNavigate,
  onDelete,
  onIndex,
  onDeindex,
  onRetry,
  onBatchIndex,
  onBatchDeindex,
  onBatchDelete,
  canBatchIndex,
  canBatchDeindex,
  canBatchDelete,
  hasSelectable,
  onDragSelect,
  onClearSelection,
}: FileListProps) {
  const { containerRef, dragRect, handleMouseDown } = useDragSelect({
    onSelect: onDragSelect,
    onClearSelection,
  });

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

  if (!isLoading && resources.length === 0 && !debouncedQuery) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        {/* Empty folder illustration */}
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true">
          <rect
            x="8"
            y="24"
            width="64"
            height="44"
            rx="6"
            fill="currentColor"
            className="text-muted/60"
          />
          <rect
            x="8"
            y="30"
            width="64"
            height="38"
            rx="6"
            fill="currentColor"
            className="text-muted"
          />
          <path d="M8 36h64" stroke="currentColor" className="text-border" strokeWidth="1.5" />
          <rect
            x="14"
            y="24"
            width="22"
            height="8"
            rx="3"
            fill="currentColor"
            className="text-muted/60"
          />
          <path
            d="M28 51 l6-6 l6 6"
            stroke="currentColor"
            className="text-muted-foreground/40"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M34 45v12"
            stroke="currentColor"
            className="text-muted-foreground/40"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <div>
          <p className="text-sm font-medium text-foreground">This folder is empty</p>
          <p className="text-xs text-muted-foreground mt-1">Files you add will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div role="grid" aria-label="File list">
      {selectionCount > 0 ? (
        <SelectionToolbar
          selectionCount={selectionCount}
          canBatchIndex={canBatchIndex}
          canBatchDeindex={canBatchDeindex}
          canBatchDelete={canBatchDelete}
          onBatchIndex={onBatchIndex}
          onBatchDeindex={onBatchDeindex}
          onBatchDelete={onBatchDelete}
        />
      ) : (
        <SearchBar
          searchQuery={searchQuery}
          isLoading={isLoading}
          onChange={onSearchChange}
          onClear={onClearSearch}
        />
      )}

      <ColumnHeaders
        sort={sort}
        allSelected={allSelected}
        someSelected={someSelected}
        hasSelectable={hasSelectable}
        indexedCount={indexedCount}
        totalCount={totalCount}
        isLoading={isLoading}
        onToggleSort={onToggleSort}
        onSelectAll={onSelectAll}
      />

      {isLoading && <FileListSkeleton />}

      {!isLoading && resources.length === 0 && debouncedQuery && (
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

      {!isLoading && resources.length > 0 && (
         
        <div
          ref={containerRef}
          className="relative transition-opacity duration-200 select-none"
          onMouseDown={handleMouseDown}
        >
          {dragRect && (
            <div
              className="absolute z-10 border border-primary/60 bg-primary/10 pointer-events-none rounded-sm"
              style={{
                left: dragRect.left,
                top: dragRect.top,
                width: dragRect.width,
                height: dragRect.height,
              }}
              aria-hidden="true"
            />
          )}
          {resources.map((resource) => (
            <FileRow
              key={resource.resourceId}
              resourceId={resource.resourceId}
              name={resource.name}
              type={resource.type}
              status={resource.status}
              modifiedAt={resource.modifiedAt}
              path={resource.path}
              resource={resource}
              searchHighlight={debouncedQuery}
              isDeleting={deletingId === resource.resourceId}
              isPendingDelete={pendingDeleteId === resource.resourceId}
              isIndexing={isIndexing && resource.status === 'pending'}
              isSelected={selected.has(resource.resourceId)}
              onNavigate={onNavigate}
              onDelete={onDelete}
              onIndex={onIndex}
              onDeindex={onDeindex}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
