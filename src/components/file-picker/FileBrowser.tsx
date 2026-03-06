'use client';

import { useCallback, useMemo } from 'react';

import { BreadcrumbBar } from '@/components/file-picker/BreadcrumbBar';
import { DeleteConfirmDialog } from '@/components/file-picker/DeleteConfirmDialog';
import { FileList } from '@/components/file-picker/FileList';
import { useBatchActions } from '@/hooks/useBatchActions';
import { useConnection } from '@/hooks/useConnection';
import { useDeleteFlow } from '@/hooks/useDeleteFlow';
import { useFolderNavigation } from '@/hooks/useFolderNavigation';
import { useIndexing } from '@/hooks/useIndexing';
import { useKBResources } from '@/hooks/useKnowledgeBase';
import { useOrganization } from '@/hooks/useOrganization';
import { useResourceMerge } from '@/hooks/useResourceMerge';
import { useResources } from '@/hooks/useResources';
import { useSelection } from '@/hooks/useSelection';
import { useSortAndFilter } from '@/hooks/useSortAndFilter';
import { cn } from '@/lib/utils';

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

  // --- Indexing (single instance; kbId shared with deleteFlow + batchActions) ---
  const indexing = useIndexing(connection?.connection_id, org?.org_id);
  const { kbId, localStatuses } = indexing;

  // --- Delete flow (declared early so hiddenResourceIds is available for merge) ---
  const deleteFlow = useDeleteFlow(kbId);
  const { deleteTarget, deletingId, hiddenResourceIds } = deleteFlow;

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

  // --- Batch actions (index / deindex / delete for multi-select) ---
  const batch = useBatchActions({
    indexing,
    selectedResources,
    kbResources,
    onBatchDelete: deleteFlow.handleBatchDelete,
    clearSelection,
  });

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

  const isLoading = isConnLoading || isResLoading;
  const isError = isConnError || isResError;
  const errorMessage = connError?.message ?? resError?.message;

  return (
    <div className="flex flex-col h-full">
      <DeleteConfirmDialog
        open={!!deleteTarget}
        fileName={deleteTarget?.name ?? ''}
        onConfirm={deleteFlow.handleDeleteConfirm}
        onCancel={deleteFlow.handleDeleteCancel}
      />

      <BreadcrumbBar
        folderStack={folderStack}
        onBack={handleBackWithReset}
        onBreadcrumbClick={handleBreadcrumbClickWithReset}
      />

      <div className="flex-1 overflow-auto">
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
        <FileList
          resources={sortedResources}
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          deletingId={deletingId}
          pendingDeleteId={deleteFlow.isDeletePending ? deletingId : null}
          indexedCount={indexedCount}
          totalCount={resources.length}
          isIndexing={batch.isIndexing}
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
          onDelete={deleteFlow.handleDelete}
          onIndex={batch.handleIndex}
          onDeindex={batch.handleDeindex}
          onRetry={handleRetry}
          onBatchIndex={batch.handleBatchIndex}
          onBatchDeindex={batch.handleBatchDeindex}
          onBatchDelete={batch.handleBatchDelete}
          canBatchIndex={batch.canBatchIndex}
          canBatchDeindex={batch.canBatchDeindex}
          canBatchDelete={batch.canBatchDelete}
          hasSelectable={hasSelectable}
        />
      </div>
    </div>
  );
}
