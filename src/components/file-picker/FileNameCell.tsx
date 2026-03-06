import { HighlightedName } from '@/components/file-picker/HighlightedName';

import type { LucideIcon } from 'lucide-react';

type FileNameCellProps = {
  name: string;
  isFolder: boolean;
  icon: LucideIcon;
  searchHighlight: string;
  onNavigate: (e: React.MouseEvent) => void;
};

export function FileNameCell({
  name,
  isFolder,
  icon: Icon,
  searchHighlight,
  onNavigate,
}: FileNameCellProps) {
  if (isFolder) {
    return (
      <div role="gridcell" className="flex items-center min-w-0">
        <button
          type="button"
          className="flex items-center gap-3 min-w-0 -my-2.5 py-2.5 cursor-pointer hover:underline"
          onClick={onNavigate}
        >
          <Icon className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          <span className="truncate text-sm font-semibold">
            <HighlightedName name={name} query={searchHighlight} />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div role="gridcell" className="flex items-center gap-3 min-w-0">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate text-sm">
        <HighlightedName name={name} query={searchHighlight} />
      </span>
    </div>
  );
}
