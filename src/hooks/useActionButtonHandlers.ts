import { useCallback } from 'react';

import type { Resource } from '@/types/resource';

type Params = {
  resourceId: string;
  name: string;
  path: string;
  resource: Resource;
  onIndex: (resource: Resource) => void;
  onDeindex: (resourceId: string, path: string) => void;
  onDelete: (resourceId: string, name: string, path: string) => void;
};

type ActionButtonHandlers = {
  handleIndex: (e: React.MouseEvent) => void;
  handleDeindex: (e: React.MouseEvent) => void;
  handleDelete: (e: React.MouseEvent) => void;
};

export function useActionButtonHandlers({
  resourceId,
  name,
  path,
  resource,
  onIndex,
  onDeindex,
  onDelete,
}: Params): ActionButtonHandlers {
  const handleIndex = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onIndex(resource);
    },
    [resource, onIndex],
  );

  const handleDeindex = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDeindex(resourceId, path);
    },
    [resourceId, path, onDeindex],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(resourceId, name, path);
    },
    [resourceId, name, path, onDelete],
  );

  return { handleIndex, handleDeindex, handleDelete };
}
