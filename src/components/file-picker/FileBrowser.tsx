'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

import { DeleteConfirmDialog } from '@/components/file-picker/DeleteConfirmDialog';
import { FileList } from '@/components/file-picker/FileList';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConnection } from '@/hooks/useConnection';
import { useDeleteKBResource, useIndexResources, useKBResources } from '@/hooks/useKnowledgeBase';
import { useOrganization } from '@/hooks/useOrganization';
import { useResources } from '@/hooks/useResources';
import { cn } from '@/lib/utils';

import type { Resource } from '@/types/resource';

type BreadcrumbEntry = {
  id: string | undefined;
  name: string;
  /** inode_path of this folder — used to fetch KB resources at this level */
  path: string;
};

type DeleteTarget = {
  resourceId: string;
  name: string;
  path: string;
};

// Show at most this many segments before collapsing middle ones into "..."
const MAX_VISIBLE_CRUMBS = 4;

export function FileBrowser() {
  const {
    data: connection,
    isLoading: isConnLoading,
    isError: isConnError,
    error: connError,
  } = useConnection();
  const { data: org } = useOrganization();
  const [folderStack, setFolderStack] = useState<BreadcrumbEntry[]>([
    { id: undefined, name: 'Root', path: '/' },
  ]);
  // Tracks opacity for fade transition on folder navigation
  const [visible, setVisible] = useState(true);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // KB state — set after first successful indexing operation
  const [kbId, setKbId] = useState<string | undefined>(undefined);
  // Tracks resource IDs hidden from view after delete (optimistic removal)
  const [hiddenResourceIds, setHiddenResourceIds] = useState<ReadonlySet<string>>(new Set());

  // Delete flow state
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteMutation = useDeleteKBResource(kbId);

  // Index flow
  const indexMutation = useIndexResources();

  const currentFolder = folderStack[folderStack.length - 1];
  const {
    data: connectionResources = [],
    isLoading: isResLoading,
    isError: isResError,
    error: resError,
    refetch,
  } = useResources(connection?.connection_id, currentFolder.id);

  // KB resources at the current folder level — provides indexed status overlay
  const { data: kbResources = [] } = useKBResources(kbId, currentFolder.path);

  // Merge connection resources with KB status — folders first, then files alphabetically
  const resources = useMemo<Resource[]>(() => {
    const statusMap = new Map(kbResources.map((r) => [r.resourceId, r.status]));
    return connectionResources
      .filter((r) => !hiddenResourceIds.has(r.resourceId))
      .map((r) => ({ ...r, status: statusMap.get(r.resourceId) ?? r.status }));
  }, [connectionResources, kbResources, hiddenResourceIds]);

  const indexedCount = useMemo(
    () => resources.filter((r) => r.status === 'indexed').length,
    [resources],
  );

  const isLoading = isConnLoading || isResLoading;
  const isError = isConnError || isResError;
  const errorMessage = connError?.message ?? resError?.message;

  /** Fade out → update stack → fade in */
  const navigateTo = useCallback((updater: (prev: BreadcrumbEntry[]) => BreadcrumbEntry[]) => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    setVisible(false);
    fadeTimer.current = setTimeout(() => {
      setFolderStack(updater);
      setVisible(true);
    }, 150);
  }, []);

  const handleNavigate = useCallback(
    (resourceId: string, name: string, folderPath: string) => {
      navigateTo((prev) => [...prev, { id: resourceId, name, path: folderPath }]);
    },
    [navigateTo],
  );

  const handleBreadcrumbClick = useCallback(
    (index: number) => {
      navigateTo((prev) => prev.slice(0, index + 1));
    },
    [navigateTo],
  );

  const handleBack = useCallback(() => {
    if (folderStack.length <= 1) return;
    navigateTo((prev) => prev.slice(0, -1));
  }, [folderStack.length, navigateTo]);

  // Keyboard: Backspace or Alt+← navigates up
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Backspace' || (e.key === 'ArrowLeft' && e.altKey)) {
        e.preventDefault();
        handleBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleBack]);

  // Clean up fade timer on unmount
  useEffect(
    () => () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    },
    [],
  );

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
    // Brief pause for exit animation before optimistic cache removal
    await new Promise<void>((r) => setTimeout(r, 180));
    setDeletingId(null);
    // Optimistically hide from connection resource view
    setHiddenResourceIds((prev) => new Set([...prev, target.resourceId]));
    deleteMutation.mutate(target.path, {
      onError: () => {
        // Restore if the API call fails — KB resource rollback is handled inside the hook
        setHiddenResourceIds((prev) => {
          const next = new Set(prev);
          next.delete(target.resourceId);
          return next;
        });
      },
    });
  }, [deleteTarget, deleteMutation]);

  /**
   * Index one or more resources. Creates a new KB containing the supplied
   * resources; to preserve previously indexed items pass them in too.
   */
  const handleIndex = useCallback(
    (resource: Resource) => {
      if (!connection || !org) return;

      // Re-index: include already-indexed items so they aren't lost when KB is recreated
      const alreadyIndexed = kbResources.filter(
        (r) =>
          (r.status === 'indexed' || r.status === 'pending') &&
          r.resourceId !== resource.resourceId,
      );
      const allResources = [...alreadyIndexed, resource];

      indexMutation.mutate(
        { connectionId: connection.connection_id, resources: allResources, orgId: org.org_id },
        { onSuccess: (kb) => setKbId(kb.knowledge_base_id) },
      );
    },
    [connection, org, kbResources, indexMutation],
  );

  const handleDeindex = useCallback(
    (path: string) => {
      deleteMutation.mutate(path);
    },
    [deleteMutation],
  );

  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  // Build breadcrumb segments — collapse middle items when stack is deep
  const breadcrumbSegments = (() => {
    if (folderStack.length <= MAX_VISIBLE_CRUMBS) return folderStack;
    // Keep first, last two, collapse the rest
    const collapsed = folderStack.slice(1, folderStack.length - 2);
    return [
      folderStack[0],
      { id: '__overflow__', name: '...', overflow: collapsed },
      ...folderStack.slice(folderStack.length - 2),
    ] as (BreadcrumbEntry & { overflow?: BreadcrumbEntry[] })[];
  })();

  return (
    <div className="flex flex-col h-full">
      <DeleteConfirmDialog
        open={!!deleteTarget}
        fileName={deleteTarget?.name ?? ''}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={folderStack.length <= 1}
          onClick={handleBack}
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbSegments.map((entry, index) => {
              const isLast = index === breadcrumbSegments.length - 1;
              const isOverflow = entry.id === '__overflow__';
              const overflowEntry = entry as BreadcrumbEntry & { overflow?: BreadcrumbEntry[] };
              // Find the real index in folderStack for non-overflow items
              const stackIndex = folderStack.findIndex((f) => f.id === entry.id);

              return (
                <span key={entry.id ?? 'root'} className="contents">
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage>{entry.name}</BreadcrumbPage>
                    ) : isOverflow ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <BreadcrumbLink className="cursor-pointer select-none">
                            &hellip;
                          </BreadcrumbLink>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {overflowEntry.overflow?.map((o) => {
                            const oIndex = folderStack.findIndex((f) => f.id === o.id);
                            return (
                              <DropdownMenuItem
                                key={o.id}
                                onClick={() => handleBreadcrumbClick(oIndex)}
                              >
                                {o.name}
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <BreadcrumbLink
                        className="cursor-pointer hover:underline"
                        onClick={() => handleBreadcrumbClick(stackIndex)}
                      >
                        {entry.name}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </span>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* File List — opacity fade on folder navigation */}
      <div
        className={cn(
          'flex-1 overflow-auto transition-opacity duration-150 ease-out',
          visible ? 'opacity-100' : 'opacity-0',
        )}
      >
        <FileList
          resources={resources}
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          deletingId={deletingId}
          pendingDeleteId={deleteMutation.isPending ? deletingId : null}
          indexedCount={indexedCount}
          totalCount={resources.length}
          isIndexing={indexMutation.isPending}
          onNavigate={handleNavigate}
          onDelete={handleDelete}
          onIndex={handleIndex}
          onDeindex={handleDeindex}
          onRetry={handleRetry}
        />
      </div>
    </div>
  );
}
