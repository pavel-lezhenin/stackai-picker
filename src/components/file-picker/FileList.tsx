'use client';

import { ColumnHeaders } from '@/components/file-picker/ColumnHeaders';
import { DragSelectContainer } from '@/components/file-picker/DragSelectContainer';
import { EmptyFolderPlaceholder } from '@/components/file-picker/EmptyFolderPlaceholder';
import { FileListError } from '@/components/file-picker/FileListError';
import { NoSearchResults } from '@/components/file-picker/NoSearchResults';
import { FileRowsCanvas } from '@/components/file-picker/FileRowsCanvas';
import { FileListSkeleton } from '@/components/file-picker/FileListSkeleton';
import { SearchBar } from '@/components/file-picker/SearchBar';
import { SelectionToolbar } from '@/components/file-picker/SelectionToolbar';
import { cn } from '@/lib/utils';

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
  onDeindex: (resourceId: string, path: string) => void;
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
  if (isError) {
    return <FileListError message={errorMessage} onRetry={onRetry} />;
  }

  if (!isLoading && resources.length === 0 && !debouncedQuery) {
    return <EmptyFolderPlaceholder />;
  }

  return (
    <div role="grid" aria-label="File list" className="flex flex-col flex-1">
      {/* Both bars are always mounted to prevent layout shift on swap.
          CSS visibility + pointer-events toggle instead of conditional render. */}
      <div className="relative h-10 border-b border-border">
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-150',
            selectionCount > 0 ? 'opacity-0 pointer-events-none' : 'opacity-100',
          )}
        >
          <SearchBar
            searchQuery={searchQuery}
            isLoading={isLoading}
            onChange={onSearchChange}
            onClear={onClearSearch}
          />
        </div>
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-150',
            selectionCount === 0 ? 'opacity-0 pointer-events-none' : 'opacity-100',
          )}
        >
          <SelectionToolbar
            selectionCount={selectionCount}
            canBatchIndex={canBatchIndex}
            canBatchDeindex={canBatchDeindex}
            canBatchDelete={canBatchDelete}
            onBatchIndex={onBatchIndex}
            onBatchDeindex={onBatchDeindex}
            onBatchDelete={onBatchDelete}
          />
        </div>
      </div>

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
        <NoSearchResults query={debouncedQuery} onClear={onClearSearch} />
      )}

      {!isLoading && resources.length > 0 && (
        <DragSelectContainer onSelect={onDragSelect} onClearSelection={onClearSelection}>
          <FileRowsCanvas
            resources={resources}
            debouncedQuery={debouncedQuery}
            deletingId={deletingId}
            pendingDeleteId={pendingDeleteId}
            isIndexing={isIndexing}
            selected={selected}
            onNavigate={onNavigate}
            onDelete={onDelete}
            onIndex={onIndex}
            onDeindex={onDeindex}
            onToggleSelect={onToggleSelect}
          />
        </DragSelectContainer>
      )}
    </div>
  );
}
