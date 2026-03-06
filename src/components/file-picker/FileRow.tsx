'use client';

import { memo, useCallback } from 'react';
import { Check, Loader2, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/file-picker/StatusBadge';
import { cn } from '@/lib/utils';
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
  onDeindex: (path: string) => void;
  onToggleSelect: (resourceId: string, shiftKey: boolean) => void;
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

  const handleClick = useCallback(() => {
    if (isFolder) onNavigate(resourceId, name, path);
  }, [isFolder, resourceId, name, path, onNavigate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && isFolder) onNavigate(resourceId, name, path);
    },
    [isFolder, resourceId, name, path, onNavigate],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(resourceId, name, path);
    },
    [resourceId, name, path, onDelete],
  );

  const handleCheckbox = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleSelect(resourceId, e.shiftKey);
    },
    [resourceId, onToggleSelect],
  );

  const handleIndex = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onIndex(resource);
    },
    [resource, onIndex],
  );

  const handleDeindex = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDeindex(path);
    },
    [path, onDeindex],
  );

  const isNotIndexed = status === null || status === 'resource';
  const isPending = status === 'pending' || isIndexing;
  const isIndexed = status === 'indexed';

  return (
    <div
      role="row"
      tabIndex={0}
      className={cn(
        'group grid grid-cols-[28px_1fr_100px_120px_136px] items-center gap-4 px-4 py-2.5',
        'border-b border-border/50 transition-all duration-200',
        'hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none',
        isFolder && 'cursor-pointer',
        isSelected && 'bg-primary/5',
        isDeleting && 'opacity-0 scale-95 pointer-events-none',
        isPendingDelete && 'opacity-60',
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`${iconLabel}: ${name}`}
      aria-selected={isSelected}
    >
      {/* Checkbox */}
      <div role="gridcell" className="flex items-center" onClick={handleCheckbox}>
        <Checkbox checked={isSelected} tabIndex={-1} aria-label={`Select ${name}`} />
      </div>
      {/* Name + Icon */}
      <div role="gridcell" className="flex items-center gap-3 min-w-0">
        <Icon
          className={cn('h-4 w-4 shrink-0', isFolder ? 'text-amber-500' : 'text-muted-foreground')}
          aria-hidden="true"
        />
        <span className={cn('truncate text-sm', isFolder && 'font-semibold')}>
          <HighlightedName name={name} query={searchHighlight} />
        </span>
      </div>

      {/* Status */}
      <div role="gridcell">
        <StatusBadge status={status} />
      </div>

      {/* Modified Date */}
      <div role="gridcell" className="text-xs text-muted-foreground">
        {formatDate(modifiedAt)}
      </div>

      {/* Actions: index toggle + delete */}
      <div role="gridcell" className="flex items-center justify-end gap-0.5">
        {/* Index / pending / de-index toggle */}
        {isNotIndexed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleIndex}
                aria-label={`Index ${name}`}
              >
                Index
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add to Knowledge Base</TooltipContent>
          </Tooltip>
        )}

        {isPending && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground cursor-default"
            disabled
            aria-label="Indexing in progress"
          >
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
            Indexing
          </Button>
        )}

        {/* "Indexed ✓" that morphs to "De-index" on hover — CSS-only, no useState needed */}
        {isIndexed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 px-2 text-xs transition-colors group/indexed',
                  'text-emerald-600 hover:text-destructive hover:bg-destructive/10',
                )}
                onClick={handleDeindex}
                aria-label={`De-index ${name}`}
              >
                {/* Default: "Indexed ✓" — hidden when button is hovered */}
                <span className="flex items-center gap-1 group-hover/indexed:hidden">
                  <Check className="h-3 w-3" />
                  Indexed
                </span>
                {/* Hover: "De-index" */}
                <span className="hidden items-center gap-1 group-hover/indexed:flex">
                  <X className="h-3 w-3" />
                  De-index
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove from Knowledge Base</TooltipContent>
          </Tooltip>
        )}

        {/* Delete — fixed dimensions prevent CLS when status changes */}
        <div className="w-8 h-8 shrink-0">
          {!isFolder && isIndexed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={handleDelete}
                  disabled={isPendingDelete}
                  aria-label={`Remove ${name} from listing`}
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
    </div>
  );
});

/** Renders name with the matching substring bolded. Case-insensitive. */
function HighlightedName({ name, query }: { name: string; query: string }) {
  if (!query) return <>{name}</>;
  const lowerName = name.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  const idx = lowerName.indexOf(lowerQuery);
  if (idx === -1) return <>{name}</>;

  const before = name.slice(0, idx);
  const match = name.slice(idx, idx + lowerQuery.length);
  const after = name.slice(idx + lowerQuery.length);

  return (
    <>
      {before}
      <span className="font-bold text-foreground">{match}</span>
      {after}
    </>
  );
}
