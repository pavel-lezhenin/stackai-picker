'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConnection } from '@/hooks/useConnection';
import { useResources } from '@/hooks/useResources';
import { cn } from '@/lib/utils';

type BreadcrumbEntry = {
  id: string | undefined;
  name: string;
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
  const [folderStack, setFolderStack] = useState<BreadcrumbEntry[]>([
    { id: undefined, name: 'Root' },
  ]);
  // Tracks opacity for fade transition on folder navigation
  const [visible, setVisible] = useState(true);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    (resourceId: string, name: string) => {
      navigateTo((prev) => [...prev, { id: resourceId, name }]);
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

  const handleDelete = useCallback((_resourceId: string, _name: string) => {
    // TODO: Epic 4 / US-2.1 — connect to useDeleteKBResource mutation with confirmation dialog
  }, []);

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
          onNavigate={handleNavigate}
          onDelete={handleDelete}
          onRetry={handleRetry}
        />
      </div>
    </div>
  );
}
