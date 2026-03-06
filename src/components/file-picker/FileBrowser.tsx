'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

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
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

import type { PaginatedResponse } from '@/types/api';
import type { ConnectionResource, Resource, ResourceStatus } from '@/types/resource';
import { toResource } from '@/types/resource';

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

/** Indexing lifecycle priority — higher = further along. */
function statusPriority(s: ResourceStatus): number {
  if (s === 'indexed') return 3;
  if (s === 'pending') return 2;
  if (s === 'resource') return 1;
  return 0; // null
}

/**
 * Recursively fetches ALL descendants of a folder (files + subfolders at every level).
 * Used to expand a folder tree into individual file resource IDs before indexing —
 * the backend processes individual files in parallel, whereas a single folder ID
 * is processed sequentially.
 */
async function fetchFolderChildren(connectionId: string, folderId: string): Promise<Resource[]> {
  const all: ConnectionResource[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({ resource_id: folderId });
    if (cursor) params.set('cursor', cursor);
    const page = await apiFetch<PaginatedResponse<ConnectionResource>>(
      `/connections/${connectionId}/resources?${params}`,
    );
    all.push(...page.data);
    cursor = page.next_cursor ?? null;
  } while (cursor);

  const resources = all.map(toResource);

  // Recurse into subfolders to collect their descendants too
  const subfolders = resources.filter((r) => r.type === 'folder');
  const nested = await Promise.all(
    subfolders.map((sf) => fetchFolderChildren(connectionId, sf.resourceId)),
  );

  return [...resources, ...nested.flat()];
}

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
  // Optimistic status overrides — keyed by resource name.
  // On Index click: new file → 'pending', already-indexed → 'indexed' (preserves badge).
  // Merge rule: take whichever status is further along the lifecycle (indexed > pending > null).
  // This single Map replaces indexingResourceId + keepIndexedNames + 2 useEffects.
  const [localStatuses, setLocalStatuses] = useState<Map<string, ResourceStatus>>(new Map());
  // Status filter for the file list
  const [statusFilter, setStatusFilter] = useState<'all' | 'indexed' | 'not-indexed'>('all');

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

  // KB resources at the current folder level — provides indexed status for children.
  const { data: kbResources = [] } = useKBResources(kbId, currentFolder.path);

  // Merge connection resources with KB status
  const resources = useMemo<Resource[]>(() => {
    // Primary lookup: by resourceId; fallback by name (KB API may return different IDs)
    const statusById = new Map(kbResources.map((r) => [r.resourceId, r.status]));
    const statusByName = new Map(kbResources.map((r) => [r.name, r.status]));

    return connectionResources
      .filter((r) => !hiddenResourceIds.has(r.resourceId))
      .map((r) => {
        const serverStatus = statusById.get(r.resourceId) ?? statusByName.get(r.name) ?? r.status;
        const localStatus = localStatuses.get(r.name);
        // Take whichever status is further along the indexing lifecycle.
        // This handles every transition cleanly without effects:
        //  - local 'pending' + server null → pending (optimistic, server hasn't caught up)
        //  - local 'pending' + server 'indexed' → indexed (server confirmed)
        //  - local 'indexed' + server 'pending' → indexed (suppress re-process flicker)
        const status =
          localStatus !== undefined && statusPriority(localStatus) > statusPriority(serverStatus)
            ? localStatus
            : serverStatus;
        return { ...r, status };
      });
  }, [connectionResources, kbResources, hiddenResourceIds, localStatuses]);

  const indexedCount = useMemo(
    () => resources.filter((r) => r.status === 'indexed').length,
    [resources],
  );

  // Apply status filter — unfiltered counts are passed separately to the toolbar summary
  const filteredResources = useMemo<Resource[]>(() => {
    if (statusFilter === 'all') return resources;
    if (statusFilter === 'indexed') return resources.filter((r) => r.status === 'indexed');
    return resources.filter((r) => r.status === null || r.status === 'resource');
  }, [resources, statusFilter]);

  const isLoading = isConnLoading || isResLoading || !visible;
  const isError = isConnError || isResError;
  const errorMessage = connError?.message ?? resError?.message;

  /** Fade out → update stack → fade in */
  const navigateTo = useCallback((updater: (prev: BreadcrumbEntry[]) => BreadcrumbEntry[]) => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    setVisible(false);
    setStatusFilter('all'); // reset filter on folder navigation
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
   * Index a resource. If it's a folder, fetches its children and sends all
   * individual file IDs — the backend processes individual files in parallel,
   * whereas a single folder ID is handled sequentially.
   */
  const handleIndex = useCallback(
    async (resource: Resource) => {
      if (!connection || !org) return;

      // Re-index: include already-indexed items so they aren't lost when KB is recreated
      const alreadyIndexed = kbResources.filter(
        (r) =>
          (r.status === 'indexed' || r.status === 'pending') &&
          r.resourceId !== resource.resourceId,
      );

      // Expand folder → individual files for parallel backend processing
      let newResources: Resource[];
      // Names of folders that should be marked 'indexed' on success.
      // KB only tracks files — folders would stay 'pending' forever without explicit cleanup.
      let folderNames: string[] = [];
      if (resource.type === 'folder') {
        setLocalStatuses((prev) => {
          const next = new Map(prev);
          next.set(resource.name, 'pending');
          alreadyIndexed.forEach((r) => next.set(r.name, 'indexed'));
          return next;
        });

        try {
          const children = await fetchFolderChildren(connection.connection_id, resource.resourceId);
          // Send only files as connection_source_ids — subfolders would be processed sequentially
          newResources = children.filter((c) => c.type === 'file');
          if (newResources.length === 0) {
            toast.error('Folder is empty — nothing to index');
            setLocalStatuses((prev) => {
              const next = new Map(prev);
              next.delete(resource.name);
              return next;
            });
            return;
          }
          // Mark ALL children (files + subfolders) as pending for visual feedback
          // when user navigates into the folder
          folderNames = [
            resource.name,
            ...children.filter((c) => c.type === 'folder').map((c) => c.name),
          ];
          setLocalStatuses((prev) => {
            const next = new Map(prev);
            children.forEach((c) => next.set(c.name, 'pending'));
            alreadyIndexed.forEach((r) => next.set(r.name, 'indexed'));
            return next;
          });
        } catch {
          toast.error(`Failed to load folder contents`);
          setLocalStatuses((prev) => {
            const next = new Map(prev);
            next.delete(resource.name);
            return next;
          });
          return;
        }
      } else {
        newResources = [resource];
        setLocalStatuses((prev) => {
          const next = new Map(prev);
          next.set(resource.name, 'pending');
          alreadyIndexed.forEach((r) => next.set(r.name, 'indexed'));
          return next;
        });
      }

      const allResources = [...alreadyIndexed, ...newResources];

      indexMutation.mutate(
        { connectionId: connection.connection_id, resources: allResources, orgId: org.org_id },
        {
          onSuccess: (kb) => {
            setKbId(kb.knowledge_base_id);
            // Mark folders as 'indexed' immediately — KB never tracks them,
            // so their status can only come from localStatuses.
            if (folderNames.length > 0) {
              setLocalStatuses((prev) => {
                const next = new Map(prev);
                folderNames.forEach((name) => next.set(name, 'indexed'));
                return next;
              });
            }
            const label =
              resource.type === 'folder'
                ? `Started indexing ${newResources.length} files from '${resource.name}'`
                : `Started indexing '${resource.name}'`;
            toast.success(label);
          },
          onError: () => {
            setLocalStatuses((prev) => {
              const next = new Map(prev);
              newResources.forEach((r) => next.delete(r.name));
              return next;
            });
          },
        },
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
        {!isLoading && !isError && resources.length > 0 && (
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
          resources={filteredResources}
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
