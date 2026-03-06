import type { BreadcrumbEntry } from '@/hooks/useFolderNavigation';

// Show at most this many segments before collapsing middle ones into "..."
const MAX_VISIBLE_CRUMBS = 4;

export type BreadcrumbSegment = BreadcrumbEntry & { overflow?: BreadcrumbEntry[] };

export function buildBreadcrumbSegments(stack: BreadcrumbEntry[]): BreadcrumbSegment[] {
  if (stack.length <= MAX_VISIBLE_CRUMBS) return stack;
  const collapsed = stack.slice(1, stack.length - 2);
  return [
    stack[0],
    { id: '__overflow__', name: '...', path: '', overflow: collapsed },
    ...stack.slice(stack.length - 2),
  ];
}
