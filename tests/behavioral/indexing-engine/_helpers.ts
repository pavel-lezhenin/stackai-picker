import type { Resource } from '@/types/resource';

export function mkResource(
  id: string,
  name: string,
  type: 'file' | 'folder',
  status: Resource['status'] = null,
): Resource {
  return { resourceId: id, name, type, status, modifiedAt: null, path: `/${name}` };
}

export function mkKBFile(
  id: string,
  name: string,
  status: Resource['status'] = 'indexed',
): Resource {
  return mkResource(id, name, 'file', status);
}

/** Simulate folder expansion — returns flat list of children with parentId. */
export function mkChildren(
  folderId: string,
  files: Array<{ id: string; name: string; type?: 'file' | 'folder'; parentId?: string }>,
) {
  return files.map((f) => ({
    resourceId: f.id,
    name: f.name,
    type: (f.type ?? 'file') as 'file' | 'folder',
    parentId: f.parentId ?? folderId,
  }));
}
