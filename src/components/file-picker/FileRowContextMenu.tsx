'use client';

import { Check, FolderOpen, Trash2, X } from 'lucide-react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

import type { Resource, ResourceStatus } from '@/types/resource';

type FileRowContextMenuProps = {
  children: React.ReactNode;
  name: string;
  path: string;
  resource: Resource;
  status: ResourceStatus;
  isFolder: boolean;
  resourceId: string;
  onNavigate?: (resourceId: string, name: string, path: string) => void;
  onIndex: (resource: Resource) => void;
  onDeindex: (resourceId: string, path: string) => void;
  onDelete: (resourceId: string, name: string, path: string) => void;
};

export function FileRowContextMenu({
  children,
  name,
  path,
  resource,
  status,
  isFolder,
  resourceId,
  onNavigate,
  onIndex,
  onDeindex,
  onDelete,
}: FileRowContextMenuProps) {
  const isNotIndexed = status === null || status === 'resource';
  const isPending = status === 'pending';
  const isIndexed = status === 'indexed';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {isFolder && onNavigate && (
          <>
            <ContextMenuItem onClick={() => onNavigate(resourceId, name, path)}>
              <FolderOpen className="h-3.5 w-3.5 mr-2 text-amber-500" />
              Open folder
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        {isNotIndexed && !isPending && (
          <ContextMenuItem onClick={() => onIndex(resource)}>
            <Check className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            Add to Knowledge Base
          </ContextMenuItem>
        )}

        {isIndexed && (
          <ContextMenuItem onClick={() => onDeindex(resourceId, path)}>
            <X className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            Remove from Knowledge Base
          </ContextMenuItem>
        )}

        {!isFolder && isIndexed && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              onClick={() => onDelete(resourceId, name, path)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Remove from listing
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
