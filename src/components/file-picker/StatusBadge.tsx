'use client';

import { memo } from 'react';
import { Check, Minus, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import type { ResourceStatus } from '@/types/resource';

type StatusBadgeProps = {
  status: ResourceStatus;
};

const STATUS_CONFIG = {
  indexed: {
    label: 'Indexed',
    icon: Check,
    className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  },
  pending: {
    label: 'Pending',
    icon: Loader2,
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
  resource: {
    label: 'Not Indexed',
    icon: Minus,
    className: 'bg-muted text-muted-foreground border-border',
  },
  none: {
    label: 'Not Indexed',
    icon: Minus,
    className: 'bg-muted text-muted-foreground border-border',
  },
} as const;

export const StatusBadge = memo(function StatusBadge({ status }: StatusBadgeProps) {
  // Fall back to 'none' for any status value not in the map (e.g. 'error', 'failed')
  // that the API may return but isn't part of our documented ResourceStatus union.
  const config = STATUS_CONFIG[status ?? 'none'] ?? STATUS_CONFIG.none;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        'w-[100px] justify-center gap-1 transition-colors duration-200',
        config.className,
      )}
    >
      <Icon className={cn('h-3 w-3', status === 'pending' && 'animate-spin')} />
      {config.label}
    </Badge>
  );
});
