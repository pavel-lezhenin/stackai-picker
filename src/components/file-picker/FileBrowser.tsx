'use client';

import { useCallback, useMemo, useState } from 'react';

import { BreadcrumbBar } from '@/components/file-picker/BreadcrumbBar';
import { DeleteConfirmDialog } from '@/components/file-picker/DeleteConfirmDialog';
import { FileList } from '@/components/file-picker/FileList';
import { useConnection } from '@/hooks/useConnection';
import { useFolderNavigation } from '@/hooks/useFolderNavigation';
import { useIndexing } from '@/hooks/useIndexing';
import { useKBResources } from '@/hooks/useKnowledgeBase';
import { useOrganization } from '@/hooks/useOrganization';
import { useResourceMerge } from '@/hooks/useResourceMerge';
import { useResources } from '@/hooks/useResources';
import { useSelection } from '@/hooks/useSelection';
import { useSortAndFilter } from '@/hooks/useSortAndFilter';
import { cn } from '@/lib/utils';

import type { Resource } from '@/types/resource';

type DeleteTarget = {
  resourceId: string;
  name: string;
  path: string;
};

export function FileBrowser() {
  const {
    data: connection,
    isLoading: isConnLoading,
    isError: isConnError,
    error: connError,
  } = useConnection();
  const { data: org } = useOrganization();

  // --- Navigation ---
  const { folderStack, currentFolder, handleNavigate, handleBreadcrumbClick, handleBack } =
    useFolderNavigation();

  // --- Data fetching ---
  const {
    data: connectionResources = [],
    isLoading: isResLoading,
    isError: isResError,
    error: resError,
    refetch,
  } = useResources(connection?.connection_id, currentFolder.id);

  // --- Delete flow (declared early so hiddenResourceIds is available for merge) ---
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hiddenResourceIds, setHiddenResourceIds] = useState<ReadonlySet<string>>(new Set());

  // --- Indexing ---
  const {
    kbId,
    localStatuses,
    isIndexing,
    isDeletePending,
    handleIndex: rawHandleIndex,
    handleDeindex,
    deleteMutation,
  } = useIndexing(connection?.connection_id, org?.org_id);

  const { data: kbResources = [] } = useKBResources(kbId, currentFolder.path);

  // --- Merge connection resources with KB status + apply filter ---
  const { filteredResources, resources, indexedCount, statusFilter, setStatusFilter, resetFilter } =
    useResourceMerge(connectionResources, kbResources, hiddenResourceIds, localStatuses);

  // --- Sort + Search (client-side, operates on filteredResources) ---
  const {
    sortedResources,
    sort,
    toggleSort,
    searchQuery,
    debouncedQuery,
    handleSearchChange,
    clearSearch,
  } = useSortAndFilter(filteredResources);

  // --- Selection (operates on the visible sorted resources) ---
  const sortedResourceIds = useMemo(
    () => sortedResources.map((r) => r.resourceId),
    [sortedResources],
  );
  // Pending rows are not selectable
  const selectableResourceIds = useMemo(
    () => sortedResources.filter((r) => r.status !== 'pending').map((r) => r.resourceId),
    [sortedResources],
  );
  const {
    selected,
    toggle: toggleSelect,
    selectAll,
    clear: clearSelection,
    allSelected,
    someSelected,
    hasSelectable,
    count: selectionCount,
  } = useSelection(sortedResourceIds, selectableResourceIds);

  // Build lookup for selected resources
  const selectedResources = useMemo(
    () => sortedResources.filter((r) => selected.has(r.resourceId)),
    [sortedResources, selected],
  );

  // Determine which batch actions are applicable to the current selection
  const canBatchIndex = useMemo(
    () => selectedResources.some((r) => r.status === null || r.status === 'resource'),
    [selectedResources],
  );
  const canBatchDeindex = useMemo(
    () => selectedResources.some((r) => r.status === 'indexed'),
    [selectedResources],
  );
  const canBatchDelete = useMemo(
    () => selectedResources.some((r) => r.type !== 'folder' && r.status === 'indexed'),
    [selectedResources],
  );

  // Wrap handleIndex to inject kbResources (breaks the circular dep)
  const handleIndex = useCallback(
    (resource: Resource) => rawHandleIndex(resource, kbResources),
    [rawHandleIndex, kbResources],
  );

  // --- Delete handlers ---
  const handleDelete = useCallback((resourceId: string, name: string, path: string) => {
    setDeleteTarget({ resourceId, name, path });
  }, []);

  const handleDeleteCancel = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setDeletingId(target.resourceId);
    await new Promise<void>((r) => setTimeout(r, 180));
    setDeletingId(null);
    setHiddenResourceIds((prev) => new Set([...prev, target.resourceId]));
    deleteMutation.mutate(target.path, {
      onError: () => {
        setHiddenResourceIds((prev) => {
          const next = new Set(prev);
          next.delete(target.resourceId);
          return next;
        });
      },
    });
  }, [deleteTarget, deleteMutation]);

  // --- Navigation wrappers that reset the status filter + selection ---
  const handleNavigateWithReset = useCallback(
    (resourceId: string, name: string, folderPath: string) => {
      resetFilter();
      clearSearch();
      clearSelection();
      handleNavigate(resourceId, name, folderPath);
    },
    [handleNavigate, resetFilter, clearSearch, clearSelection],
  );

  const handleBreadcrumbClickWithReset = useCallback(
    (index: number) => {
      resetFilter();
      clearSearch();
      clearSelection();
      handleBreadcrumbClick(index);
    },
    [handleBreadcrumbClick, resetFilter, clearSearch, clearSelection],
  );

  const handleBackWithReset = useCallback(() => {
    resetFilter();
    clearSearch();
    clearSelection();
    handleBack();
  }, [handleBack, resetFilter, clearSearch, clearSelection]);

  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  // --- Batch actions ---
  const handleBatchIndex = useCallback(() => {
    for (const r of selectedResources) {
      if (r.status === null || r.status === 'resource') {
        rawHandleIndex(r, kbResources);
      }
    }
    clearSelection();
  }, [selectedResources, rawHandleIndex, kbResources, clearSelection]);

  const handleBatchDeindex = useCallback(() => {
    for (const r of selectedResources) {
      if (r.status === 'indexed') {
        handleDeindex(r.path);
      }
    }
    clearSelection();
  }, [selectedResources, handleDeindex, clearSelection]);

  const handleBatchDelete = useCallback(() => {
    for (const r of selectedResources) {
      if (r.type !== 'folder' && r.status === 'indexed') {
        setHiddenResourceIds((prev) => new Set([...prev, r.resourceId]));
        deleteMutation.mutate(r.path, {
          onError: () => {
            setHiddenResourceIds((prev) => {
              const next = new Set(prev);
              next.delete(r.resourceId);
              return next;
            });
          },
        });
      }
    }
    clearSelection();
  }, [selectedResources, deleteMutation, clearSelection]);

  const isLoading = isConnLoading || isResLoading;
  const isError = isConnError || isResError;
  const errorMessage = connError?.message ?? resError?.message;

  return (
    <div className="flex flex-col h-full">
      <DeleteConfirmDialog
        open={!!deleteTarget}
        fileName={deleteTarget?.name ?? ''}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      <BreadcrumbBar
        folderStack={folderStack}
        onBack={handleBackWithReset}
        onBreadcrumbClick={handleBreadcrumbClickWithReset}
      />

      <div className="flex-1 overflow-auto">
        {!isConnLoading && !isError && (resources.length > 0 || isResLoading) && (
          <div className="flex items-center gap-1 px-4 py-2 border-b border-border">
            <span className="text-xs text-muted-foreground mr-1">Show:</span>
            {(['all', 'indexed', 'not-indexed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn(
                  'text-xs px-2.5 py-0.5 rounded-full transition-colors',
                  statusFilter === f
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {f === 'all' ? 'All' : f === 'indexed' ? 'Indexed' : 'Not Indexed'}
              </button>
            ))}
          </div>
        )}
        <FileList
          resources={sortedResources}
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          deletingId={deletingId}
          pendingDeleteId={isDeletePending ? deletingId : null}
          indexedCount={indexedCount}
          totalCount={resources.length}
          isIndexing={isIndexing}
          sort={sort}
          searchQuery={searchQuery}
          debouncedQuery={debouncedQuery}
          onToggleSort={toggleSort}
          onSearchChange={handleSearchChange}
          onClearSearch={clearSearch}
          selected={selected}
          allSelected={allSelected}
          someSelected={someSelected}
          selectionCount={selectionCount}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          onNavigate={handleNavigateWithReset}
          onDelete={handleDelete}
          onIndex={handleIndex}
          onDeindex={handleDeindex}
          onRetry={handleRetry}
          onBatchIndex={handleBatchIndex}
          onBatchDeindex={handleBatchDeindex}
          onBatchDelete={handleBatchDelete}
          canBatchIndex={canBatchIndex}
          canBatchDeindex={canBatchDeindex}
          canBatchDelete={canBatchDelete}
          hasSelectable={hasSelectable}
        />
      </div>
    </div>
  );
}
