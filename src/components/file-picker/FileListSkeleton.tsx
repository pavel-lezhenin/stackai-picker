'use client';

import { Skeleton } from '@/components/ui/skeleton';

const SKELETON_ROWS = 8;

export function FileListSkeleton() {
  return (
    <div className="divide-y divide-border/50">
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div
          key={i}
          className="grid grid-cols-[28px_1fr_100px_120px_136px] items-center gap-4 px-4 h-[53px]"
        >
          <Skeleton className="h-4 w-4 rounded-[4px]" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 shrink-0 rounded" />
            <Skeleton className="h-4 w-[60%]" />
          </div>
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-4 w-[80px]" />
          <div className="flex items-center justify-end gap-0.5">
            <Skeleton className="h-4 w-12 rounded" />
            <Skeleton className="h-4 w-8 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
