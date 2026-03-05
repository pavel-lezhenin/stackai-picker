'use client';

import { useCallback, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

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
import { useConnection } from '@/hooks/useConnection';
import { useResources } from '@/hooks/useResources';

type BreadcrumbEntry = {
  id: string | undefined;
  name: string;
};

export function FileBrowser() {
  const {
    data: connection,
    isLoading: isConnLoading,
    isError: isConnError,
    error: connError,
  } = useConnection();
  const [folderStack, setFolderStack] = useState<BreadcrumbEntry[]>([
    { id: undefined, name: 'Root' },
  ]);

  const currentFolder = folderStack[folderStack.length - 1];
  const {
    data: resources = [],
    isLoading: isResLoading,
    isError: isResError,
    error: resError,
    refetch,
  } = useResources(connection?.connection_id, currentFolder.id);

  const isLoading = isConnLoading || isResLoading;
  const isError = isConnError || isResError;
  const errorMessage = connError?.message ?? resError?.message;

  const handleNavigate = useCallback((resourceId: string, name: string) => {
    setFolderStack((prev) => [...prev, { id: resourceId, name }]);
  }, []);

  const handleBreadcrumbClick = useCallback((index: number) => {
    setFolderStack((prev) => prev.slice(0, index + 1));
  }, []);

  const handleBack = useCallback(() => {
    setFolderStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const handleDelete = useCallback((_resourceId: string, _name: string) => {
    // TODO: connect to useDeleteKBResource mutation (US-2.1)
  }, []);

  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
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
            {folderStack.map((entry, index) => {
              const isLast = index === folderStack.length - 1;
              return (
                <span key={entry.id ?? 'root'} className="contents">
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage>{entry.name}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        className="cursor-pointer hover:underline"
                        onClick={() => handleBreadcrumbClick(index)}
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

      {/* File List */}
      <div className="flex-1 overflow-auto">
        <FileList
          resources={resources}
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          onNavigate={handleNavigate}
          onDelete={handleDelete}
          onRetry={handleRetry}
        />
      </div>
    </div>
  );
}
