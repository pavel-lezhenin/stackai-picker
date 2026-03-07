'use client';

import { memo } from 'react';

import { ActionButtons } from '@/components/file-picker/ActionButtons';
import { FileRowContextMenu } from '@/components/file-picker/FileRowContextMenu';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/file-picker/StatusBadge';
import { cn, formatDate } from '@/lib/utils';
import { FileNameCell } from '@/components/file-picker/FileNameCell';
import { useFileRowHandlers } from '@/hooks/useFileRowHandlers';
import { getFileTypeIcon } from '@/types/resource';

import type { Resource, ResourceStatus, ResourceType } from '@/types/resource';

type FileRowProps = {
  resourceId: string;
  name: string;
  type: ResourceType;
  status: ResourceStatus;
  modifiedAt: string | null;
  path: string;
  /** The full Resource object — passed to onIndex without re-constructing */
  resource: Resource;
  /** Substring to highlight in the file name (from search input) */
  searchHighlight?: string;
  /** Whether this row is selected */
  isSelected?: boolean;
  /** True while the exit animation runs (before row is removed from cache) */
  isDeleting?: boolean;
  /** True while the DELETE request is in-flight */
  isPendingDelete?: boolean;
  /** True while an index mutation is in-flight for this row */
  isIndexing?: boolean;
  onNavigate: (resourceId: string, name: string, path: string) => void;
  onDelete: (resourceId: string, name: string, path: string) => void;
  onIndex: (resource: Resource) => void;
  onDeindex: (resourceId: string, path: string) => void;
  onToggleSelect: (resourceId: string, shiftKey: boolean) => void;
};

export const FileRow = memo(function FileRow({
  resourceId,
  name,
  type,
  status,
  modifiedAt,
  path,
  resource,
  searchHighlight = '',
  isSelected = false,
  isDeleting = false,
  isPendingDelete = false,
  isIndexing = false,
  onNavigate,
  onDelete,
  onIndex,
  onDeindex,
  onToggleSelect,
}: FileRowProps) {
  const { icon: Icon, label: iconLabel } = getFileTypeIcon(name, type);
  const isFolder = type === 'folder';
  // isPending prevents row selection while indexing is in-flight (optimistic status may not have propagated yet)
  const isPending = status === 'pending' || isIndexing;

  const { handleRowClick, handleDoubleClick, handleNavigate, handleKeyDown } = useFileRowHandlers({
    resourceId,
    name,
    path,
    isFolder,
    isPending,
    onNavigate,
    onToggleSelect,
  });

  return (
    <FileRowContextMenu
      name={name}
      path={path}
      resource={resource}
      status={status}
      isFolder={isFolder}
      resourceId={resourceId}
      onNavigate={isFolder ? onNavigate : undefined}
      onIndex={onIndex}
      onDeindex={onDeindex}
      onDelete={onDelete}
    >
      <div
        role="row"
        tabIndex={0}
        data-resource-id={resourceId}
        className={cn(
          'group grid grid-cols-[28px_1fr_100px_120px_136px] items-center gap-4 px-4 py-2.5',
          'border-b border-border/50 transition-[opacity,transform] duration-200',
          'hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none',
          'active:bg-primary/10',
          isSelected && 'bg-primary/5',
          isDeleting && 'opacity-0 scale-95 pointer-events-none',
          isPendingDelete && 'opacity-60',
        )}
        onClick={handleRowClick}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        aria-label={`${iconLabel}: ${name}`}
        aria-selected={isSelected}
      >
        {/* Checkbox — expanded click area without changing layout */}
        <div
          role="gridcell"
          className="flex items-center -my-2.5 py-2.5 -mr-4 pr-4 -ml-2 pl-2 cursor-pointer"
        >
          <Checkbox
            checked={isSelected}
            disabled={isPending}
            tabIndex={-1}
            className="pointer-events-none"
            aria-label={`Select ${name}`}
          />
        </div>
        <FileNameCell
          name={name}
          isFolder={isFolder}
          icon={Icon}
          searchHighlight={searchHighlight}
          onNavigate={handleNavigate}
        />

        {/* Status */}
        <div role="gridcell">
          <StatusBadge status={status} />
        </div>

        {/* Modified Date */}
        <div role="gridcell" className="text-xs text-muted-foreground">
          {formatDate(modifiedAt)}
        </div>

        <ActionButtons
          resourceId={resourceId}
          name={name}
          path={path}
          resource={resource}
          status={status}
          isFolder={isFolder}
          isSelected={isSelected}
          isPendingDelete={isPendingDelete}
          onIndex={onIndex}
          onDeindex={onDeindex}
          onDelete={onDelete}
        />
      </div>
    </FileRowContextMenu>
  );
});
