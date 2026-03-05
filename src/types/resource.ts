import {
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  Presentation,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { z } from 'zod';

// --- API shapes (raw from Stack AI) ---

export const ConnectionResourceSchema = z.object({
  resource_id: z.string(),
  inode_type: z.enum(['directory', 'file']),
  inode_path: z.object({ path: z.string() }),
  status: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  modified_at: z.string().nullable().optional(),
});

export type ConnectionResource = z.infer<typeof ConnectionResourceSchema>;

export const KBResourceSchema = z.object({
  resource_id: z.string(),
  inode_type: z.enum(['directory', 'file']),
  inode_path: z.object({ path: z.string() }),
  status: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  modified_at: z.string().nullable().optional(),
});

export type KBResource = z.infer<typeof KBResourceSchema>;

export const ConnectionSchema = z.object({
  connection_id: z.string(),
  name: z.string().optional(),
  provider_id: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

/** Wrapper for /v1/ endpoints that return { status_code, data, ... } */
export const V1ListResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    status_code: z.number(),
    data: z.array(itemSchema),
  });

export type Connection = z.infer<typeof ConnectionSchema>;

// --- Internal UI shapes ---

export type ResourceType = 'file' | 'folder';
export type ResourceStatus = 'indexed' | 'pending' | 'resource' | null;

export type Resource = {
  resourceId: string;
  name: string;
  type: ResourceType;
  status: ResourceStatus;
  modifiedAt: string | null;
  path: string;
};

// --- Helpers ---

/** Extract display name from inode_path.path (last segment) */
export function extractName(inodePath: string): string {
  const segments = inodePath.replace(/\/$/, '').split('/');
  return segments[segments.length - 1] || inodePath;
}

/** Map API inode_type to internal Resource type */
export function mapInodeType(inodeType: 'directory' | 'file'): ResourceType {
  return inodeType === 'directory' ? 'folder' : 'file';
}

/** Transform raw API resource into internal Resource shape */
export function toResource(raw: ConnectionResource | KBResource): Resource {
  const status = raw.status as ResourceStatus;
  return {
    resourceId: raw.resource_id,
    name: extractName(raw.inode_path.path),
    type: mapInodeType(raw.inode_type),
    status: status ?? null,
    modifiedAt: raw.modified_at ?? null,
    path: raw.inode_path.path,
  };
}

// --- File type icon mapping (OCP: add entry, change zero components) ---

export const FILE_TYPE_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  folder: { icon: Folder, label: 'Folder' },
  pdf: { icon: FileText, label: 'PDF Document' },
  doc: { icon: FileText, label: 'Word Document' },
  docx: { icon: FileText, label: 'Word Document' },
  xls: { icon: FileSpreadsheet, label: 'Spreadsheet' },
  xlsx: { icon: FileSpreadsheet, label: 'Spreadsheet' },
  csv: { icon: FileSpreadsheet, label: 'CSV File' },
  ppt: { icon: Presentation, label: 'Presentation' },
  pptx: { icon: Presentation, label: 'Presentation' },
  png: { icon: FileImage, label: 'Image' },
  jpg: { icon: FileImage, label: 'Image' },
  jpeg: { icon: FileImage, label: 'Image' },
  gif: { icon: FileImage, label: 'Image' },
  svg: { icon: FileImage, label: 'Image' },
  json: { icon: FileCode, label: 'JSON File' },
  xml: { icon: FileCode, label: 'XML File' },
  html: { icon: FileCode, label: 'HTML File' },
  zip: { icon: FileArchive, label: 'Archive' },
  default: { icon: File, label: 'File' },
};

export function getFileTypeIcon(
  name: string,
  type: ResourceType,
): { icon: LucideIcon; label: string } {
  if (type === 'folder') return FILE_TYPE_ICONS.folder;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return FILE_TYPE_ICONS[ext] ?? FILE_TYPE_ICONS.default;
}

// --- Query key factory ---

export const resourceKeys = {
  all: ['resources'] as const,
  connections: () => [...resourceKeys.all, 'connections'] as const,
  lists: () => [...resourceKeys.all, 'list'] as const,
  list: (connectionId: string, folderId?: string) =>
    [...resourceKeys.lists(), connectionId, folderId ?? 'root'] as const,
  kbResources: () => [...resourceKeys.all, 'kb'] as const,
  kbResourceList: (kbId: string, resourcePath: string) =>
    [...resourceKeys.kbResources(), kbId, resourcePath] as const,
} as const;
