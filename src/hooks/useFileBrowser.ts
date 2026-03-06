'use client';

import { useCallback, useMemo } from 'react';

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

/**
 * Aggregates all data-fetching and state for the FileBrowser.
 * The component itself is left with pure JSX wiring.
 */
export function useFileBrowser() {
  const {
    data: connection,
    isLoading: isConnLoading,
    isError: isConnError,
    error: connError,
  } = useConnection();
  const { data: org } = useOrganization();

  const { folderStack, currentFolder, handleNavigate, handleBreadcrumbClick, handleBack } =
    useFolderNavigation();

  const {
    data: connectionResources = [],
    isLoading: isResLoading,
    isError: isResError,
    error: resError,
    refetch,
  } = useResources(connection?.connection_id, currentFolder.id);

  const indexing = useIndexing(connection?.connection_id, org?.org_id);
  const { kbId, localStatuses } = indexing;

  const deleteFlow = useDeleteFlow(kbId);
  const { deletingId, hiddenResourceIds } = deleteFlow;

  const { data: kbResources = [] } = useKBResources(kbId, currentFolder.path);

  const { filteredResources, resources, indexedCount, statusFilter, setStatusFilter, resetFilter } =
    useResourceMerge(connectionResources, kbResources, hiddenResourceIds, localStatuses);

  const {
    sortedResources,
    sort,
    toggleSort,
    searchQuery,
    debouncedQuery,
    handleSearchChange,
    clearSearch,
  } = useSortAndFilter(filteredResources);

  const sortedResourceIds = useMemo(
    () => sortedResources.map((r) => r.resourceId),
    [sortedResources],
  );
  const selectableResourceIds = useMemo(
    () => sortedResources.filter((r) => r.status !== 'pending').map((r) => r.resourceId),
    [sortedResources],
  );
  const {
    selected,
    toggle: toggleSelect,
    selectAll,
    selectRange,
    clear: clearSelection,
    allSelected,
    someSelected,
    hasSelectable,
    count: selectionCount,
  } = useSelection(sortedResourceIds, selectableResourceIds);

  const selectedResources = useMemo(
    () => sortedResources.filter((r) => selected.has(r.resourceId)),
    [sortedResources, selected],
  );

  const batch = useBatchActions({
    indexing,
    selectedResources,
    kbResources,
    onBatchDelete: deleteFlow.handleBatchDelete,
    clearSelection,
  });

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

  const handleRetry = useCallback(() => refetch(), [refetch]);

  return {
    // nav
    folderStack,
    handleNavigateWithReset,
    handleBreadcrumbClickWithReset,
    handleBackWithReset,
    // delete
    deleteTarget: deleteFlow.deleteTarget,
    deletingId,
    deleteFlow,
    // filter
    statusFilter,
    setStatusFilter,
    // list data
    sortedResources,
    isLoading: isConnLoading || isResLoading,
    isError: isConnError || isResError,
    errorMessage: connError?.message ?? resError?.message,
    indexedCount,
    totalCount: resources.length,
    // sort / search
    sort,
    toggleSort,
    searchQuery,
    debouncedQuery,
    handleSearchChange,
    clearSearch,
    // selection
    selected,
    allSelected,
    someSelected,
    selectionCount,
    hasSelectable,
    toggleSelect,
    selectAll,
    selectRange,
    clearSelection,
    // batch
    batch,
    handleRetry,
  };
}
