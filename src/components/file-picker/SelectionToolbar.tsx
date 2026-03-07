import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

type SelectionToolbarProps = {
  selectionCount: number;
  canBatchIndex: boolean;
  canBatchDeindex: boolean;
  canBatchDelete: boolean;
  onBatchIndex: () => void;
  onBatchDeindex: () => void;
  onBatchDelete: () => void;
};

export function SelectionToolbar({
  selectionCount,
  canBatchIndex,
  canBatchDeindex,
  canBatchDelete,
  onBatchIndex,
  onBatchDeindex,
  onBatchDelete,
}: SelectionToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 h-10 bg-primary/5 transition-colors">
      <span className="text-sm font-medium">{selectionCount} selected</span>
      <div className="flex-1" />
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={onBatchIndex}
        disabled={!canBatchIndex}
      >
        Index
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={onBatchDeindex}
        disabled={!canBatchDeindex}
      >
        De-index
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs text-destructive hover:bg-destructive/10"
        onClick={onBatchDelete}
        disabled={!canBatchDelete}
      >
        <Trash2 className="h-3 w-3 mr-1" />
        Delete
      </Button>
    </div>
  );
}
