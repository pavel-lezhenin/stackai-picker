'use client';

import { useCallback, useState } from 'react';

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

  // --- Navigation wrappers that reset the status filter ---
  const handleNavigateWithReset = useCallback(
    (resourceId: string, name: string, folderPath: string) => {
      resetFilter();
      clearSearch();
      handleNavigate(resourceId, name, folderPath);
    },
    [handleNavigate, resetFilter, clearSearch],
  );

  const handleBreadcrumbClickWithReset = useCallback(
    (index: number) => {
      resetFilter();
      clearSearch();
      handleBreadcrumbClick(index);
    },
    [handleBreadcrumbClick, resetFilter, clearSearch],
  );

  const handleBackWithReset = useCallback(() => {
    resetFilter();
    clearSearch();
    handleBack();
  }, [handleBack, resetFilter, clearSearch]);

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
          onNavigate={handleNavigateWithReset}
          onDelete={handleDelete}
          onIndex={handleIndex}
          onDeindex={handleDeindex}
          onRetry={handleRetry}
        />
      </div>
    </div>
  );
}
