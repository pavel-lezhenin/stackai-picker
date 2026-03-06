'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Manages multi-selection state for a list of resources.
 * Supports toggle, select-all, range selection via Shift+click, and clear.
 */
export function useSelection(resourceIds: readonly string[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** Tracks the last toggled row for Shift+click range selection */
  const lastToggledIndex = useRef<number | null>(null);

  const toggle = useCallback(
    (id: string, shiftKey = false) => {
      const currentIndex = resourceIds.indexOf(id);

      // Shift+click range selection
      if (shiftKey && lastToggledIndex.current !== null && currentIndex !== -1) {
        const start = Math.min(lastToggledIndex.current, currentIndex);
        const end = Math.max(lastToggledIndex.current, currentIndex);
        const rangeIds = resourceIds.slice(start, end + 1);

        setSelected((prev) => {
          const next = new Set(prev);
          for (const rid of rangeIds) {
            next.add(rid);
          }
          return next;
        });
        lastToggledIndex.current = currentIndex;
        return;
      }

      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      lastToggledIndex.current = currentIndex !== -1 ? currentIndex : null;
    },
    [resourceIds],
  );

  const selectAll = useCallback(() => {
    if (selected.size === resourceIds.length && resourceIds.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(resourceIds));
    }
    lastToggledIndex.current = null;
  }, [resourceIds, selected.size]);

  const clear = useCallback(() => {
    setSelected(new Set());
    lastToggledIndex.current = null;
  }, []);

  const allSelected = resourceIds.length > 0 && selected.size === resourceIds.length;
  const someSelected = selected.size > 0 && !allSelected;

  return {
    selected,
    toggle,
    selectAll,
    clear,
    allSelected,
    someSelected,
    count: selected.size,
  };
}
