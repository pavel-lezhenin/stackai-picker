import { cn } from '@/lib/utils';

import type { StatusFilter } from '@/hooks/useResourceMerge';

type StatusFilterBarProps = {
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
};

const LABELS: Record<StatusFilter, string> = {
  all: 'All',
  indexed: 'Indexed',
  'not-indexed': 'Not Indexed',
};

export function StatusFilterBar({ value, onChange }: StatusFilterBarProps) {
  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border">
      <span className="text-xs text-muted-foreground mr-1">Show:</span>
      {(['all', 'indexed', 'not-indexed'] as const).map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={cn(
            'text-xs px-2.5 py-0.5 rounded-full transition-colors',
            value === f
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {LABELS[f]}
        </button>
      ))}
    </div>
  );
}
