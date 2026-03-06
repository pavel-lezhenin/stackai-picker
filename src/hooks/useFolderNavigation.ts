'use client';

import { useCallback, useEffect, useState } from 'react';

export type BreadcrumbEntry = {
  id: string | undefined;
  name: string;
  /** inode_path of this folder — used to fetch KB resources at this level */
  path: string;
};

/**
 * Manages folder navigation state: stack, back/forward, breadcrumb clicks,
 * keyboard shortcuts (Backspace / Alt+←).
 */
export function useFolderNavigation() {
  const [folderStack, setFolderStack] = useState<BreadcrumbEntry[]>([
    { id: undefined, name: 'Root', path: '/' },
  ]);

  const currentFolder = folderStack[folderStack.length - 1];

  const handleNavigate = useCallback((resourceId: string, name: string, _folderPath: string) => {
    setFolderStack((prev) => {
      const parentPath = prev[prev.length - 1].path;
      // Build cumulative path so useKBResources queries the correct resource_path
      const path = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
      return [...prev, { id: resourceId, name, path }];
    });
  }, []);

  const handleBreadcrumbClick = useCallback((index: number) => {
    setFolderStack((prev) => prev.slice(0, index + 1));
  }, []);

  const handleBack = useCallback(() => {
    if (folderStack.length <= 1) return;
    setFolderStack((prev) => prev.slice(0, -1));
  }, [folderStack.length]);

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

  return {
    folderStack,
    currentFolder,
    handleNavigate,
    handleBreadcrumbClick,
    handleBack,
  };
}
