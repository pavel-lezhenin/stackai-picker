import { useCallback } from 'react';

type Params = {
  resourceId: string;
  name: string;
  path: string;
  isFolder: boolean;
  isPending: boolean;
  onNavigate: (resourceId: string, name: string, path: string) => void;
  onToggleSelect: (resourceId: string, shiftKey: boolean) => void;
};

type FileRowHandlers = {
  handleRowClick: (e: React.MouseEvent) => void;
  handleDoubleClick: (e: React.MouseEvent) => void;
  handleNavigate: (e: React.MouseEvent) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
};

export function useFileRowHandlers({
  resourceId,
  name,
  path,
  isFolder,
  isPending,
  onNavigate,
  onToggleSelect,
}: Params): FileRowHandlers {
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      // Ignore clicks that finish a text selection — user wants to copy text, not toggle the row
      if (window.getSelection()?.toString()) return;
      if (!isPending) onToggleSelect(resourceId, e.shiftKey);
    },
    [isPending, resourceId, onToggleSelect],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isFolder) {
        e.preventDefault();
        onNavigate(resourceId, name, path);
      }
    },
    [isFolder, resourceId, name, path, onNavigate],
  );

  const handleNavigate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onNavigate(resourceId, name, path);
    },
    [resourceId, name, path, onNavigate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && isFolder) onNavigate(resourceId, name, path);
    },
    [isFolder, resourceId, name, path, onNavigate],
  );

  return { handleRowClick, handleDoubleClick, handleNavigate, handleKeyDown };
}
