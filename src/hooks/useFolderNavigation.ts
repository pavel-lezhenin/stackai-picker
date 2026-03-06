'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type BreadcrumbEntry = {
  id: string | undefined;
  name: string;
  /** inode_path of this folder — used to fetch KB resources at this level */
  path: string;
};

/**
 * Manages folder navigation state: stack, back/forward, breadcrumb clicks,
 * fade transition, keyboard shortcuts (Backspace / Alt+←).
 */
export function useFolderNavigation() {
  const [folderStack, setFolderStack] = useState<BreadcrumbEntry[]>([
    { id: undefined, name: 'Root', path: '/' },
  ]);
  const [visible, setVisible] = useState(true);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentFolder = folderStack[folderStack.length - 1];

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

  return {
    folderStack,
    currentFolder,
    visible,
    handleNavigate,
    handleBreadcrumbClick,
    handleBack,
  };
}
