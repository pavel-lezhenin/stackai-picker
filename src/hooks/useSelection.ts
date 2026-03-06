'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Manages multi-selection state for a list of resources.
 * Supports toggle, select-all, range selection via Shift+click, and clear.
 * @param resourceIds - all visible resource IDs (for ordering in Shift+click)
 * @param selectableIds - subset that can actually be selected (e.g. excludes pending)
 */
export function useSelection(resourceIds: readonly string[], selectableIds: readonly string[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** Tracks the last toggled row for Shift+click range selection */
  const lastToggledIndex = useRef<number | null>(null);

  const selectableSet = useMemo(() => new Set(selectableIds), [selectableIds]);

  const toggle = useCallback(
    (id: string, shiftKey = false) => {
      if (!selectableSet.has(id)) return;

      const currentIndex = resourceIds.indexOf(id);

      // Shift+click range selection
      if (shiftKey && lastToggledIndex.current !== null && currentIndex !== -1) {
        const start = Math.min(lastToggledIndex.current, currentIndex);
        const end = Math.max(lastToggledIndex.current, currentIndex);
        const rangeIds = resourceIds.slice(start, end + 1);

        setSelected((prev) => {
          const next = new Set(prev);
          for (const rid of rangeIds) {
            if (selectableSet.has(rid)) next.add(rid);
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
    [resourceIds, selectableSet],
  );

  const selectAll = useCallback(() => {
    if (selected.size === selectableIds.length && selectableIds.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIds));
    }
    lastToggledIndex.current = null;
  }, [selectableIds, selected.size]);

  const clear = useCallback(() => {
    setSelected(new Set());
    lastToggledIndex.current = null;
  }, []);

  /** Adds a set of IDs to the selection (used by drag-to-select). */
  const selectRange = useCallback(
    (ids: string[]) => {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (selectableSet.has(id)) next.add(id);
        }
        return next;
      });
    },
    [selectableSet],
  );

  const allSelected = selectableIds.length > 0 && selected.size === selectableIds.length;
  const someSelected = selected.size > 0 && !allSelected;
  const hasSelectable = selectableIds.length > 0;

  return {
    selected,
    toggle,
    selectAll,
    selectRange,
    clear,
    allSelected,
    someSelected,
    hasSelectable,
    count: selected.size,
  };
}
