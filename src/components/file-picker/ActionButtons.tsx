import { memo } from 'react';
import { Check, Loader2, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useActionButtonHandlers } from '@/hooks/useActionButtonHandlers';
import { cn } from '@/lib/utils';

import type { Resource, ResourceStatus } from '@/types/resource';

type ActionButtonsProps = {
  resourceId: string;
  name: string;
  path: string;
  resource: Resource;
  status: ResourceStatus;
  isFolder: boolean;
  isSelected?: boolean;
  isPendingDelete?: boolean;
  onIndex: (resource: Resource) => void;
  onDeindex: (resourceId: string, path: string) => void;
  onDelete: (resourceId: string, name: string, path: string) => void;
};

export const ActionButtons = memo(function ActionButtons({
  resourceId,
  name,
  path,
  resource,
  status,
  isFolder,
  isSelected = false,
  isPendingDelete = false,
  onIndex,
  onDeindex,
  onDelete,
}: ActionButtonsProps) {
  const isNotIndexed = status === null || status === 'resource';
  const isPending = status === 'pending';
  const isIndexed = status === 'indexed';

  const { handleIndex, handleDeindex, handleDelete } = useActionButtonHandlers({
    resourceId,
    name,
    path,
    resource,
    onIndex,
    onDeindex,
    onDelete,
  });

  return (
    <div className="flex items-center justify-end gap-0.5">
      {isNotIndexed && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 px-2 text-xs text-muted-foreground transition-opacity cursor-pointer',
                isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
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
                'h-7 px-2 text-xs transition-colors group/indexed cursor-pointer',
                'text-emerald-600 hover:text-destructive hover:bg-destructive/10',
              )}
              onClick={handleDeindex}
              aria-label={`De-index ${name}`}
            >
              {/*
               * Invisible spacer always occupies the width of "De-index" (the wider label)
               * so the button never resizes on hover — zero CLS.
               * Two absolutely-positioned spans cross-fade over it.
               */}
              <span className="relative flex items-center gap-1">
                <span className="invisible flex items-center gap-1" aria-hidden>
                  <X className="h-3 w-3" />
                  De-index
                </span>
                <span className="absolute inset-0 flex items-center justify-center gap-1 opacity-100 group-hover/indexed:opacity-0 transition-opacity">
                  <Check className="h-3 w-3" />
                  Indexed
                </span>
                <span className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover/indexed:opacity-100 transition-opacity">
                  <X className="h-3 w-3" />
                  De-index
                </span>
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove from Knowledge Base</TooltipContent>
        </Tooltip>
      )}

      {/* Delete — fixed dimensions prevent CLS when status changes */}
      <div className="w-8 h-8 shrink-0">
        {isIndexed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-8 w-8 transition-opacity cursor-pointer',
                  isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
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
  );
});
