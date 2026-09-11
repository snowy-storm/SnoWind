import { useCallback, useRef } from "react";
import { useSetAtom, type PrimitiveAtom } from "jotai";
import { Table } from "@tanstack/react-table";
import {
  fillPreviewAtomFamily,
  type FillPreview,
} from "@/ee/base/atoms/base-atoms";
import { cellValuesEqual } from "@/ee/base/components/cells/cell-value-equal";
import type { IBaseRow } from "@/ee/base/types/base.types";
import {
  cloneCellValue,
  computeVerticalFillRange,
  fillCellKey,
  parseBaseCellFromPoint,
} from "@/ee/base/utils/cell-fill";

const EDGE_PX = 48;
const MIN_SPEED = 4;
const MAX_SPEED = 18;

type UseCellFillOptions = {
  pageId: string;
  rowId: string;
  propertyId: string;
  table: Table<IBaseRow>;
  getOrderedRowIds: () => string[];
  onCellUpdate: (rowId: string, propertyId: string, value: unknown) => void;
};

type FillDragState = {
  pointerId: number;
  sourceRowId: string;
  propertyId: string;
  targetRowId: string;
  scrollTarget: HTMLElement | Window;
  pointerX: number;
  pointerY: number;
  rafId: number;
};

function scrollSpeed(distanceFromEdge: number): number {
  const depth = Math.min(1, (EDGE_PX - distanceFromEdge) / EDGE_PX);
  return MIN_SPEED + (MAX_SPEED - MIN_SPEED) * depth;
}

function findVerticalScrollTarget(from: HTMLElement): HTMLElement | Window {
  const grid = from.closest<HTMLElement>('[role="grid"]');
  if (grid) {
    let el: HTMLElement | null = grid;
    while (el) {
      const { overflowY } = getComputedStyle(el);
      if (
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
        el.scrollHeight > el.clientHeight + 1
      ) {
        return el;
      }
      el = el.parentElement;
    }
  }
  return window;
}

export function useCellFill({
  pageId,
  rowId,
  propertyId,
  table,
  getOrderedRowIds,
  onCellUpdate,
}: UseCellFillOptions) {
  const setFillPreview = useSetAtom(
    fillPreviewAtomFamily(pageId) as PrimitiveAtom<FillPreview>,
  );
  const dragRef = useRef<FillDragState | null>(null);

  const updatePreview = useCallback(
    (sourceRowId: string, propId: string, targetRowId: string) => {
      const range = computeVerticalFillRange(
        getOrderedRowIds(),
        sourceRowId,
        targetRowId,
        propId,
      );
      if (!range) {
        setFillPreview(null);
        return;
      }
      setFillPreview({
        sourceRowId,
        propertyId: propId,
        cellKeys: new Set(range.cellKeys),
      });
    },
    [getOrderedRowIds, setFillPreview],
  );

  const runAutoscrollFrame = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;

    const { scrollTarget, pointerX, pointerY } = drag;
    let delta = 0;
    if (scrollTarget === window) {
      const fromTop = pointerY;
      const fromBottom = window.innerHeight - pointerY;
      if (fromTop < EDGE_PX) delta = -scrollSpeed(fromTop);
      else if (fromBottom < EDGE_PX) delta = scrollSpeed(fromBottom);
      if (delta !== 0) window.scrollBy(0, delta);
    } else {
      const el = scrollTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      const fromTop = pointerY - rect.top;
      const fromBottom = rect.bottom - pointerY;
      if (fromTop < EDGE_PX) delta = -scrollSpeed(fromTop);
      else if (fromBottom < EDGE_PX) delta = scrollSpeed(fromBottom);
      if (delta !== 0) el.scrollTop += delta;
    }

    const hit = parseBaseCellFromPoint(pointerX, pointerY);
    if (hit) {
      drag.targetRowId = hit.rowId;
      updatePreview(drag.sourceRowId, drag.propertyId, hit.rowId);
    }

    drag.rafId = requestAnimationFrame(runAutoscrollFrame);
  }, [updatePreview]);

  const endDrag = useCallback(
    (apply: boolean) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      if (drag.rafId !== 0) cancelAnimationFrame(drag.rafId);

      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("cursor");

      const { sourceRowId, propertyId: propId, targetRowId } = drag;
      setFillPreview(null);

      if (!apply || targetRowId === sourceRowId) return;

      const range = computeVerticalFillRange(
        getOrderedRowIds(),
        sourceRowId,
        targetRowId,
        propId,
      );
      if (!range || range.rowIds.length <= 1) return;

      let sourceValue: unknown;
      try {
        sourceValue = table.getRow(sourceRowId, true)?.getValue(propId);
      } catch {
        return;
      }
      const cloned = cloneCellValue(sourceValue);

      for (const targetId of range.rowIds) {
        if (targetId === sourceRowId) continue;
        let current: unknown;
        try {
          current = table.getRow(targetId, true)?.getValue(propId);
        } catch {
          continue;
        }
        if (cellValuesEqual(current, cloned)) continue;
        onCellUpdate(targetId, propId, cloneCellValue(cloned));
      }
    },
    [getOrderedRowIds, onCellUpdate, setFillPreview, table],
  );

  const onFillPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      // Listen on window so the gesture survives virtualized unmount of the
      // source cell while scrolling during a long fill drag.
      document.body.style.userSelect = "none";
      document.body.style.cursor = "crosshair";

      dragRef.current = {
        pointerId: e.pointerId,
        sourceRowId: rowId,
        propertyId,
        targetRowId: rowId,
        scrollTarget: findVerticalScrollTarget(e.currentTarget),
        pointerX: e.clientX,
        pointerY: e.clientY,
        rafId: 0,
      };

      setFillPreview({
        sourceRowId: rowId,
        propertyId,
        cellKeys: new Set([fillCellKey(rowId, propertyId)]),
      });

      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || ev.pointerId !== drag.pointerId) return;
        drag.pointerX = ev.clientX;
        drag.pointerY = ev.clientY;

        const hit = parseBaseCellFromPoint(ev.clientX, ev.clientY);
        if (hit) {
          drag.targetRowId = hit.rowId;
          updatePreview(drag.sourceRowId, drag.propertyId, hit.rowId);
        }

        if (drag.rafId === 0) {
          drag.rafId = requestAnimationFrame(runAutoscrollFrame);
        }
      };

      const detach = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKeyDown);
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        detach();
        endDrag(true);
      };

      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        detach();
        endDrag(false);
      };

      const onKeyDown = (ev: KeyboardEvent) => {
        if (ev.key !== "Escape") return;
        ev.preventDefault();
        detach();
        endDrag(false);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKeyDown);
    },
    [
      endDrag,
      propertyId,
      rowId,
      runAutoscrollFrame,
      setFillPreview,
      updatePreview,
    ],
  );

  return { onFillPointerDown };
}
