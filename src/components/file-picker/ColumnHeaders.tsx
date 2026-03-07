import { memo } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';

import type { SortConfig, SortField } from '@/hooks/useSortAndFilter';

type ColumnHeadersProps = {
  sort: SortConfig;
  allSelected: boolean;
  someSelected: boolean;
  hasSelectable: boolean;
  indexedCount: number;
  totalCount: number;
  isLoading: boolean;
  onToggleSort: (field: SortField) => void;
  onSelectAll: () => void;
};

export const ColumnHeaders = memo(function ColumnHeaders({
  sort,
  allSelected,
  someSelected,
  hasSelectable,
  indexedCount,
  totalCount,
  isLoading,
  onToggleSort,
  onSelectAll,
}: ColumnHeadersProps) {
  return (
    <div
      role="row"
      className="grid grid-cols-[28px_1fr_100px_120px_136px] items-center gap-4 px-4 py-2 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide"
    >
      <div
        role="columnheader"
        className="flex items-center -m-2 p-2 cursor-pointer"
        onClick={onSelectAll}
      >
        <Checkbox
          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
          disabled={!hasSelectable}
          className="pointer-events-none"
          aria-label={allSelected ? 'Deselect all' : 'Select all'}
        />
      </div>
      <div
        role="columnheader"
        className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors"
        onClick={() => onToggleSort('name')}
        aria-sort={
          sort.field === 'name' ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
        }
      >
        Name
        <SortIndicator field="name" sort={sort} />
      </div>
      <div
        role="columnheader"
        className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors"
        onClick={() => onToggleSort('status')}
        aria-sort={
          sort.field === 'status' ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
        }
      >
        Status
        <SortIndicator field="status" sort={sort} />
      </div>
      <div
        role="columnheader"
        className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors"
        onClick={() => onToggleSort('modified')}
        aria-sort={
          sort.field === 'modified'
            ? sort.direction === 'asc'
              ? 'ascending'
              : 'descending'
            : 'none'
        }
      >
        Modified
        <SortIndicator field="modified" sort={sort} />
      </div>
      <div role="columnheader" className="text-right pr-1">
        {!isLoading && (
          <span
            aria-live="polite"
            className="normal-case tracking-normal font-normal text-muted-foreground/70"
          >
            {indexedCount > 0
              ? `${indexedCount} of ${totalCount} indexed`
              : `${totalCount} item${totalCount !== 1 ? 's' : ''}`}
          </span>
        )}
      </div>
    </div>
  );
});

function SortIndicator({ field, sort }: { field: SortField; sort: SortConfig }) {
  if (sort.field !== field) return null;
  return sort.direction === 'asc' ? (
    <ArrowUp className="h-3 w-3" />
  ) : (
    <ArrowDown className="h-3 w-3" />
  );
}
