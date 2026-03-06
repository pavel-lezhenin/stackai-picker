'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { useDeleteKBResource } from '@/hooks/useKnowledgeBase';
import { useIndexResources } from '@/hooks/useIndexResources';
import { fetchFolderChildren } from '@/lib/fetchFolderChildren';

import type { Resource, ResourceStatus } from '@/types/resource';

/**
 * Files that cloud storage providers include as metadata but indexing backends
 * silently skip. If we add these to localStatuses as 'pending', they stick
 * forever because the server never returns a confirmation for them.
 * Filter them out BEFORE submission and before optimistic state updates.
 */
function isSystemFile(name: string): boolean {
  if (name.startsWith('.')) return true; // .DS_Store, .gitignore, .gitkeep, etc.
  if (name === 'desktop.ini' || name === 'Thumbs.db') return true; // Windows metadata
  return false;
}

/**
 * Encapsulates all indexing / de-indexing state and logic:
 * - KB ID lifecycle
 * - Optimistic `localStatuses` map
 * - Folder expansion into individual files
 * - Index and deindex handlers
 */
export function useIndexing(connectionId: string | undefined, orgId: string | undefined) {
  const [kbId, setKbId] = useState<string | undefined>(undefined);
  const [localStatuses, setLocalStatuses] = useState<Map<string, ResourceStatus>>(new Map());

  const indexMutation = useIndexResources();
  const deleteMutation = useDeleteKBResource(kbId);

  const handleIndex = useCallback(
    async (resource: Resource, kbResources: Resource[]) => {
      if (!connectionId || !orgId) return;

      const alreadyIndexed = kbResources.filter(
        (r) =>
          (r.status === 'indexed' || r.status === 'pending') &&
          r.resourceId !== resource.resourceId,
      );

      let newResources: Resource[];
      let folderNames: string[] = [];

      if (resource.type === 'folder') {
        setLocalStatuses((prev) => {
          const next = new Map(prev);
          next.set(resource.name, 'pending');
          alreadyIndexed.forEach((r) => next.set(r.name, 'indexed'));
          return next;
        });

        try {
          const children = await fetchFolderChildren(connectionId, resource.resourceId);
          // Exclude system files: backend silently skips them, so if we mark
          // them 'pending' in localStatuses they get stuck forever (ISS-11).
          newResources = children.filter((c) => c.type === 'file' && !isSystemFile(c.name));
          if (newResources.length === 0) {
            toast.error('Folder is empty — nothing to index');
            setLocalStatuses((prev) => {
              const next = new Map(prev);
              next.delete(resource.name);
              return next;
            });
            return;
          }
          folderNames = [
            resource.name,
            ...children.filter((c) => c.type === 'folder').map((c) => c.name),
          ];
          setLocalStatuses((prev) => {
            const next = new Map(prev);
            // Only track non-system files: system files are skipped by the
            // backend and would be stuck as 'pending' if we included them.
            children
              .filter((c) => !isSystemFile(c.name))
              .forEach((c) => next.set(c.name, 'pending'));
            alreadyIndexed.forEach((r) => next.set(r.name, 'indexed'));
            return next;
          });
        } catch {
          toast.error('Failed to load folder contents');
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
        { connectionId, resources: allResources, orgId },
        {
          onSuccess: (kb) => {
            setKbId(kb.knowledge_base_id);
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
    [connectionId, orgId, indexMutation],
  );

  const handleDeindex = useCallback(
    (path: string) => {
      // Clear optimistic local status so the merge immediately picks up "not indexed"
      // instead of keeping the stale 'pending'/'indexed' override forever.
      const name = path.split('/').pop();
      if (name) {
        setLocalStatuses((prev) => {
          const next = new Map(prev);
          next.delete(name);
          return next;
        });
      }
      deleteMutation.mutate(path);
    },
    [deleteMutation],
  );

  return {
    kbId,
    localStatuses,
    isIndexing: indexMutation.isPending,
    isDeletePending: deleteMutation.isPending,
    handleIndex,
    handleDeindex,
    deleteMutation,
  };
}
