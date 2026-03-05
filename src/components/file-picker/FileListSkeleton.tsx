'use client';

import { Skeleton } from '@/components/ui/skeleton';

const SKELETON_ROWS = 8;

export function FileListSkeleton() {
  return (
    <div className="divide-y divide-border/50">
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_100px_120px_40px] items-center gap-4 px-4 py-2.5"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 shrink-0 rounded" />
            <Skeleton className="h-4 w-[60%]" />
          </div>
          <Skeleton className="h-5 w-[100px] rounded-full" />
          <Skeleton className="h-3 w-[80px]" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      ))}
    </div>
  );
}
