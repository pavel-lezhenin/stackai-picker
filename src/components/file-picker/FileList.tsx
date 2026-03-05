'use client';

import { useCallback } from 'react';
import { AlertTriangle, FolderOpen } from 'lucide-react';

import { FileRow } from '@/components/file-picker/FileRow';
import { FileListSkeleton } from '@/components/file-picker/FileListSkeleton';
import { Button } from '@/components/ui/button';

import type { Resource } from '@/types/resource';

type FileListProps = {
  resources: Resource[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onNavigate: (resourceId: string, name: string) => void;
  onDelete: (resourceId: string, name: string) => void;
  onRetry: () => void;
};

export function FileList({
  resources,
  isLoading,
  isError,
  errorMessage,
  onNavigate,
  onDelete,
  onRetry,
}: FileListProps) {
  if (isLoading) {
    return <FileListSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <div>
          <p className="text-sm font-medium">Failed to load files</p>
          <p className="text-xs text-muted-foreground mt-1">
            {errorMessage ?? 'An unexpected error occurred'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try Again
        </Button>
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <FolderOpen className="h-10 w-10 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium">No files found</p>
          <p className="text-xs text-muted-foreground mt-1">This folder is empty</p>
        </div>
      </div>
    );
  }

  return (
    <div role="grid" aria-label="File list">
      {/* Header */}
      <div
        role="row"
        className="grid grid-cols-[1fr_100px_120px_40px] items-center gap-4 px-4 py-2 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide"
      >
        <div role="columnheader">Name</div>
        <div role="columnheader">Status</div>
        <div role="columnheader">Modified</div>
        <div role="columnheader" />
      </div>

      {/* Rows */}
      <div className="transition-opacity duration-200">
        {resources.map((resource) => (
          <FileRow
            key={resource.resourceId}
            resourceId={resource.resourceId}
            name={resource.name}
            type={resource.type}
            status={resource.status}
            modifiedAt={resource.modifiedAt}
            onNavigate={onNavigate}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
