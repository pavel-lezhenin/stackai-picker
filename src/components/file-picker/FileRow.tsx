'use client';

import { memo, useCallback } from 'react';
import { Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/file-picker/StatusBadge';
import { cn } from '@/lib/utils';
import { getFileTypeIcon } from '@/types/resource';

import type { ResourceStatus, ResourceType } from '@/types/resource';

type FileRowProps = {
  resourceId: string;
  name: string;
  type: ResourceType;
  status: ResourceStatus;
  modifiedAt: string | null;
  path: string;
  /** True while the exit animation runs (before row is removed from cache) */
  isDeleting?: boolean;
  /** True while the DELETE request is in-flight */
  isPendingDelete?: boolean;
  onNavigate: (resourceId: string, name: string) => void;
  onDelete: (resourceId: string, name: string, path: string) => void;
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const FileRow = memo(function FileRow({
  resourceId,
  name,
  type,
  status,
  modifiedAt,
  path,
  isDeleting = false,
  isPendingDelete = false,
  onNavigate,
  onDelete,
}: FileRowProps) {
  const { icon: Icon, label: iconLabel } = getFileTypeIcon(name, type);
  const isFolder = type === 'folder';

  const handleClick = useCallback(() => {
    if (isFolder) onNavigate(resourceId, name);
  }, [isFolder, resourceId, name, onNavigate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && isFolder) onNavigate(resourceId, name);
    },
    [isFolder, resourceId, name, onNavigate],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(resourceId, name, path);
    },
    [resourceId, name, path, onDelete],
  );

  return (
    <div
      role="row"
      tabIndex={0}
      className={cn(
        'group grid grid-cols-[1fr_100px_120px_40px] items-center gap-4 px-4 py-2.5',
        'border-b border-border/50 transition-all duration-200',
        'hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none',
        isFolder && 'cursor-pointer',
        isDeleting && 'opacity-0 scale-95 pointer-events-none',
        isPendingDelete && 'opacity-60',
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`${iconLabel}: ${name}`}
    >
      {/* Name + Icon */}
      <div role="gridcell" className="flex items-center gap-3 min-w-0">
        <Icon
          className={cn('h-4 w-4 shrink-0', isFolder ? 'text-amber-500' : 'text-muted-foreground')}
          aria-hidden="true"
        />
        <span className={cn('truncate text-sm', isFolder && 'font-semibold')}>{name}</span>
      </div>

      {/* Status */}
      <div role="gridcell">
        <StatusBadge status={status} />
      </div>

      {/* Modified Date */}
      <div role="gridcell" className="text-xs text-muted-foreground">
        {formatDate(modifiedAt)}
      </div>

      {/* Actions */}
      <div role="gridcell">
        {!isFolder && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleDelete}
                disabled={isPendingDelete}
                aria-label={`Remove ${name}`}
              >
                {isPendingDelete ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove from listing</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
});
