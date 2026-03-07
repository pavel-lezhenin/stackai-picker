'use client';

import type { ReactNode } from 'react';

import { DragOverlay } from '@/components/file-picker/DragOverlay';
import { useDragSelect } from '@/hooks/useDragSelect';

type DragSelectContainerProps = {
  children: ReactNode;
  onSelect: (ids: string[]) => void;
  onClearSelection: () => void;
};

/**
 * Wraps any scrollable row list with rubber-band lasso selection.
 * Rows inside must carry a `data-resource-id` attribute.
 * Remove this wrapper to disable the feature entirely — rows are unaffected.
 */
export function DragSelectContainer({
  children,
  onSelect,
  onClearSelection,
}: DragSelectContainerProps) {
  const { containerRef, dragRect, handleMouseDown } = useDragSelect({
    onSelect,
    onClearSelection,
  });

  return (
    <div
      ref={containerRef}
      className="relative transition-opacity duration-200"
      onMouseDown={handleMouseDown}
    >
      {dragRect && <DragOverlay rect={dragRect} />}
      {children}
    </div>
  );
}
