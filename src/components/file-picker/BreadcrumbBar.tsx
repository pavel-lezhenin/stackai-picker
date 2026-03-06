import { memo, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { BreadcrumbEntry } from '@/hooks/useFolderNavigation';

type BreadcrumbBarProps = {
  folderStack: BreadcrumbEntry[];
  onBack: () => void;
  onBreadcrumbClick: (index: number) => void;
};

// Show at most this many segments before collapsing middle ones into "..."
const MAX_VISIBLE_CRUMBS = 4;

type SegmentEntry = BreadcrumbEntry & { overflow?: BreadcrumbEntry[] };

function buildSegments(stack: BreadcrumbEntry[]): SegmentEntry[] {
  if (stack.length <= MAX_VISIBLE_CRUMBS) return stack;
  const collapsed = stack.slice(1, stack.length - 2);
  return [
    stack[0],
    { id: '__overflow__', name: '...', path: '', overflow: collapsed },
    ...stack.slice(stack.length - 2),
  ];
}

export const BreadcrumbBar = memo(function BreadcrumbBar({
  folderStack,
  onBack,
  onBreadcrumbClick,
}: BreadcrumbBarProps) {
  const segments = buildSegments(folderStack);

  const findStackIndex = useCallback(
    (entryId: string | undefined) => folderStack.findIndex((f) => f.id === entryId),
    [folderStack],
  );

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={folderStack.length <= 1}
        onClick={onBack}
        aria-label="Go back"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <Breadcrumb>
        <BreadcrumbList>
          {segments.map((entry, index) => {
            const isLast = index === segments.length - 1;
            const isOverflow = entry.id === '__overflow__';
            const stackIndex = findStackIndex(entry.id);

            return (
              <span key={entry.id ?? 'root'} className="contents">
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{entry.name}</BreadcrumbPage>
                  ) : isOverflow ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <BreadcrumbLink className="cursor-pointer select-none">
                          &hellip;
                        </BreadcrumbLink>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {entry.overflow?.map((o) => {
                          const oIndex = findStackIndex(o.id);
                          return (
                            <DropdownMenuItem key={o.id} onClick={() => onBreadcrumbClick(oIndex)}>
                              {o.name}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <BreadcrumbLink
                      className="cursor-pointer hover:underline"
                      onClick={() => onBreadcrumbClick(stackIndex)}
                    >
                      {entry.name}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </span>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
});
