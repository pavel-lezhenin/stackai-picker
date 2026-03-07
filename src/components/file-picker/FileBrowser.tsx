'use client';

import { BreadcrumbBar } from '@/components/file-picker/BreadcrumbBar';
import { DeleteConfirmDialog } from '@/components/file-picker/DeleteConfirmDialog';
import { FileList } from '@/components/file-picker/FileList';
import { StatusFilterBar } from '@/components/file-picker/StatusFilterBar';
import { useFileBrowser } from '@/hooks/useFileBrowser';

export function FileBrowser() {
  const {
    folderStack,
    handleNavigateWithReset,
    handleBreadcrumbClickWithReset,
    handleBackWithReset,
    deleteTarget,
    deletingId,
    deleteFlow,
    statusFilter,
    setStatusFilter,
    sortedResources,
    isLoading,
    isError,
    errorMessage,
    indexedCount,
    totalCount,
    sort,
    toggleSort,
    searchQuery,
    debouncedQuery,
    handleSearchChange,
    clearSearch,
    selected,
    allSelected,
    someSelected,
    selectionCount,
    hasSelectable,
    toggleSelect,
    selectAll,
    selectRange,
    clearSelection,
    batch,
    handleRetry,
  } = useFileBrowser();

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

      <div
        className="flex-1 flex flex-col overflow-y-scroll"
        onContextMenu={(e) => e.preventDefault()}
      >
        {!isError && <StatusFilterBar value={statusFilter} onChange={setStatusFilter} />}
        <FileList
          resources={sortedResources}
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          deletingId={deletingId}
          pendingDeleteId={deleteFlow.isDeletePending ? deletingId : null}
          indexedCount={indexedCount}
          totalCount={totalCount}
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
          onDragSelect={selectRange}
          onClearSelection={clearSelection}
        />
      </div>
    </div>
  );
}
