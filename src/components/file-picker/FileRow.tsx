'use client';

import { memo, useCallback } from 'react';
import { Trash2 } from 'lucide-react';

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
  onNavigate: (resourceId: string, name: string) => void;
  onDelete: (resourceId: string, name: string) => void;
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
      onDelete(resourceId, name);
    },
    [resourceId, name, onDelete],
  );

  return (
    <div
      role="row"
      tabIndex={0}
      className={cn(
        'group grid grid-cols-[1fr_100px_120px_40px] items-center gap-4 px-4 py-2.5',
        'border-b border-border/50 transition-colors duration-150',
        'hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none',
        isFolder && 'cursor-pointer',
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`${iconLabel}: ${name}`}
    >
      {/* Name + Icon */}
      <div role="gridcell" className="flex items-center gap-3 min-w-0">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className={cn('truncate text-sm', isFolder && 'font-medium')}>{name}</span>
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
                aria-label={`Remove ${name}`}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove from listing</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
});
