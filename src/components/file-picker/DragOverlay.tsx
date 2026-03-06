import type { DragRect } from '@/hooks/useDragSelect';

type DragOverlayProps = {
  rect: DragRect;
};

export function DragOverlay({ rect }: DragOverlayProps) {
  return (
    <div
      className="absolute z-10 border border-primary/60 bg-primary/10 pointer-events-none rounded-sm"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      aria-hidden="true"
    />
  );
}
