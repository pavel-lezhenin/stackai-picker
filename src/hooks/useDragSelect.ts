'use client';

import { useCallback, useRef, useState } from 'react';

export type DragRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type UseDragSelectOptions = {
  /** Called when the drag ends with the list of resource IDs whose rows intersect the rect */
  onSelect: (ids: string[]) => void;
  /** Called when the user clicks on empty background (no row) with < 4px movement */
  onClearSelection?: () => void;
};

/**
 * Rubber-band (lasso) selection for a scrollable list.
 *
 * Attach `containerRef` to the scroll container and `handleMouseDown` to its
 * onMouseDown handler. Rows must have `data-resource-id` attributes so the hook
 * can locate them via DOM queries.
 */
export function useDragSelect({ onSelect, onClearSelection }: UseDragSelectOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  // Track whether the drag started on a row — if so, a click (< 4px) should not clear selection
  const startedOnRow = useRef(false);
  // Mirrors dragRect state so onMouseUp closure always reads the latest value without stale closure issues
  const dragRectRef = useRef<DragRect | null>(null);
  const [dragRect, setDragRect] = useState<DragRect | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only trigger on left-button drag directly on the grid background.
      // Clicks on interactive elements (buttons, checkboxes, inputs) bubble
      // up with a target that is NOT the container itself — skip those.
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // Skip actual interactive controls — dragging from a button/checkbox is never intentional.
      // We do NOT skip [data-slot="context-menu-trigger"] because asChild forwards that attribute
      // onto the row <div> itself, which would block every row drag.
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('[role="checkbox"]')
      ) {
        return;
      }

      const container = containerRef.current;
      if (!container) return;
      startedOnRow.current = !!target.closest('[data-resource-id]');

      // Coords relative to the container (accounts for scroll)
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + container.scrollLeft;
      const y = e.clientY - rect.top + container.scrollTop;
      startPos.current = { x, y };

      const onMouseMove = (ev: MouseEvent) => {
        if (!startPos.current || !container) return;
        const cx = ev.clientX - rect.left + container.scrollLeft;
        const cy = ev.clientY - rect.top + container.scrollTop;

        const newRect = {
          left: Math.min(startPos.current.x, cx),
          top: Math.min(startPos.current.y, cy),
          width: Math.abs(cx - startPos.current.x),
          height: Math.abs(cy - startPos.current.y),
        };
        // Update ref synchronously so onMouseUp closure reads the latest rect
        dragRectRef.current = newRect;
        setDragRect(newRect);
      };

      const onMouseUp = () => {
        if (!startPos.current || !container) {
          cleanup();
          return;
        }

        // Collect rows that intersect the selection rect
        const selRect = container.getBoundingClientRect();
        const finalDrag = dragRectRef.current;
        if (!finalDrag || (finalDrag.width <= 4 && finalDrag.height <= 4)) {
          // It was a click, not a drag
          if (!startedOnRow.current) onClearSelection?.();
          cleanup();
          return;
        }

        if (finalDrag && (finalDrag.width > 4 || finalDrag.height > 4)) {
          const rows = container.querySelectorAll<HTMLElement>('[data-resource-id]');
          const ids: string[] = [];

          for (const row of rows) {
            const r = row.getBoundingClientRect();
            // Convert row rect to container-relative coords
            const rowLeft = r.left - selRect.left + container.scrollLeft;
            const rowTop = r.top - selRect.top + container.scrollTop;
            const rowRight = rowLeft + r.width;
            const rowBottom = rowTop + r.height;

            const dragRight = finalDrag.left + finalDrag.width;
            const dragBottom = finalDrag.top + finalDrag.height;

            const overlaps =
              rowLeft < dragRight &&
              rowRight > finalDrag.left &&
              rowTop < dragBottom &&
              rowBottom > finalDrag.top;

            if (overlaps) {
              const id = row.dataset.resourceId;
              if (id) ids.push(id);
            }
          }

          if (ids.length > 0) onSelect(ids);
        }

        cleanup();
      };

      const cleanup = () => {
        startPos.current = null;
        startedOnRow.current = false;
        dragRectRef.current = null;
        setDragRect(null);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [onSelect, onClearSelection],
  );

  return { containerRef, dragRect, handleMouseDown };
}
