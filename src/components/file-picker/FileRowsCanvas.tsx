'use client';

import { memo } from 'react';

import { FileRow } from '@/components/file-picker/FileRow';

import type { Resource } from '@/types/resource';

type FileRowsCanvasProps = {
  resources: Resource[];
  debouncedQuery: string;
  deletingId?: string | null;
  pendingDeleteId?: string | null;
  isIndexing: boolean;
  selected: ReadonlySet<string>;
  onNavigate: (resourceId: string, name: string, path: string) => void;
  onDelete: (resourceId: string, name: string, path: string) => void;
  onIndex: (resource: Resource) => void;
  onDeindex: (resourceId: string, path: string) => void;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
};

export const FileRowsCanvas = memo(function FileRowsCanvas({
  resources,
  debouncedQuery,
  deletingId,
  pendingDeleteId,
  isIndexing,
  selected,
  onNavigate,
  onDelete,
  onIndex,
  onDeindex,
  onToggleSelect,
}: FileRowsCanvasProps) {
  return (
    <>
      {resources.map((resource) => (
        <FileRow
          key={resource.resourceId}
          resourceId={resource.resourceId}
          name={resource.name}
          type={resource.type}
          status={resource.status}
          modifiedAt={resource.modifiedAt}
          path={resource.path}
          resource={resource}
          searchHighlight={debouncedQuery}
          isDeleting={deletingId === resource.resourceId}
          isPendingDelete={pendingDeleteId === resource.resourceId}
          isIndexing={isIndexing && resource.status === 'pending'}
          isSelected={selected.has(resource.resourceId)}
          onNavigate={onNavigate}
          onDelete={onDelete}
          onIndex={onIndex}
          onDeindex={onDeindex}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </>
  );
});
