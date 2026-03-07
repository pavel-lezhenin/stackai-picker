import { memo } from 'react';
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

import { buildBreadcrumbSegments } from '@/lib/buildBreadcrumbSegments';

import type { BreadcrumbEntry } from '@/hooks/useFolderNavigation';

type BreadcrumbBarProps = {
  folderStack: BreadcrumbEntry[];
  onBack: () => void;
  onBreadcrumbClick: (index: number) => void;
};

export const BreadcrumbBar = memo(function BreadcrumbBar({
  folderStack,
  onBack,
  onBreadcrumbClick,
}: BreadcrumbBarProps) {
  const segments = buildBreadcrumbSegments(folderStack);

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
            const stackIndex = folderStack.findIndex((f) => f.id === entry.id);

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
                          const oIndex = folderStack.findIndex((f) => f.id === o.id);
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

      <h1 className="hidden md:block ml-auto text-sm font-medium text-muted-foreground shrink-0">
        Stack AI File Picker
      </h1>
    </div>
  );
});
