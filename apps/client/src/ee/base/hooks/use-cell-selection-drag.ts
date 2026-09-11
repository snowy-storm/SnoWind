import { useCallback, useRef } from "react";
import { useSetAtom, type PrimitiveAtom } from "jotai";
import {
  cellSelectionAtomFamily,
  focusedCellAtomFamily,
} from "@/ee/base/atoms/base-atoms";
import type { FocusedCell } from "@/ee/base/types/base.types";
import {
  buildCellSelection,
  extendSelection,
  singleCellSelection,
  type CellSelection,
} from "@/ee/base/utils/cell-selection";
import { parseBaseCellFromPoint } from "@/ee/base/utils/cell-fill";

const DRAG_THRESHOLD_PX = 4;
const EDGE_PX = 48;
const MIN_SPEED = 4;
const MAX_SPEED = 18;

type UseCellSelectionDragOptions = {
  pageId: string;
  rowId: string;
  propertyId: string;
  getOrderedRowIds: () => string[];
  getSelection: () => CellSelection | null;
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

/**
 * Excel-like column-scoped selection:
 * - plain click → single cell
 * - shift+click → extend within same column
 * - click-drag → extend within same column
 */
export function useCellSelectionDrag({
  pageId,
  rowId,
  propertyId,
  getOrderedRowIds,
  getSelection,
}: UseCellSelectionDragOptions) {
  const setSelection = useSetAtom(
    cellSelectionAtomFamily(pageId) as PrimitiveAtom<CellSelection | null>,
  );
  const setFocusedCell = useSetAtom(
    focusedCellAtomFamily(pageId) as PrimitiveAtom<FocusedCell>,
  );

  const dragRef = useRef<{
    pointerId: number;
    propertyId: string;
    anchorRowId: string;
    startX: number;
    startY: number;
    dragging: boolean;
    scrollTarget: HTMLElement | Window;
    pointerX: number;
    pointerY: number;
    rafId: number;
  } | null>(null);

  const applyExtent = useCallback(
    (anchorRowId: string, propId: string, focusRowId: string) => {
      const next = buildCellSelection(
        propId,
        anchorRowId,
        focusRowId,
        getOrderedRowIds(),
      );
      if (!next) return;
      setSelection(next);
      setFocusedCell({ rowId: focusRowId, propertyId: propId });
    },
    [getOrderedRowIds, setFocusedCell, setSelection],
  );

  const runAutoscrollFrame = useCallback(() => {
    const drag = dragRef.current;
    if (!drag || !drag.dragging) return;

    const { scrollTarget, pointerX, pointerY, propertyId: propId, anchorRowId } =
      drag;
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
    if (hit && hit.propertyId === propId) {
      applyExtent(anchorRowId, propId, hit.rowId);
    }

    drag.rafId = requestAnimationFrame(runAutoscrollFrame);
  }, [applyExtent]);

  const onCellPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (
        t.closest("[data-base-row-expand]") ||
        t.closest("[data-base-fill-handle]") ||
        t.closest("button") ||
        t.closest("input") ||
        t.closest("textarea") ||
        t.closest('[role="checkbox"]')
      ) {
        return;
      }

      if (e.shiftKey) {
        e.preventDefault();
        const prev = getSelection();
        const ordered = getOrderedRowIds();
        if (prev && prev.propertyId === propertyId) {
          const next = extendSelection(prev, rowId, ordered);
          if (next) setSelection(next);
        } else {
          setSelection(singleCellSelection({ rowId, propertyId }, ordered));
        }
        setFocusedCell({ rowId, propertyId });
        (e.currentTarget.closest('[role="grid"]') as HTMLElement | null)?.focus({
          preventScroll: true,
        });
        return;
      }

      setSelection(
        singleCellSelection({ rowId, propertyId }, getOrderedRowIds()),
      );
      setFocusedCell({ rowId, propertyId });

      const scrollTarget = findVerticalScrollTarget(e.currentTarget);
      dragRef.current = {
        pointerId: e.pointerId,
        propertyId,
        anchorRowId: rowId,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
        scrollTarget,
        pointerX: e.clientX,
        pointerY: e.clientY,
        rafId: 0,
      };

      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || ev.pointerId !== drag.pointerId) return;
        drag.pointerX = ev.clientX;
        drag.pointerY = ev.clientY;

        if (!drag.dragging) {
          const dx = ev.clientX - drag.startX;
          const dy = ev.clientY - drag.startY;
          if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
          drag.dragging = true;
          document.body.style.userSelect = "none";
          document.body.style.cursor = "default";
        }

        const hit = parseBaseCellFromPoint(ev.clientX, ev.clientY);
        if (hit && hit.propertyId === drag.propertyId) {
          applyExtent(drag.anchorRowId, drag.propertyId, hit.rowId);
        }

        if (drag.rafId === 0) {
          drag.rafId = requestAnimationFrame(runAutoscrollFrame);
        }
      };

      const end = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        const drag = dragRef.current;
        dragRef.current = null;
        if (drag?.rafId) cancelAnimationFrame(drag.rafId);
        document.body.style.removeProperty("user-select");
        document.body.style.removeProperty("cursor");
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [
      applyExtent,
      getOrderedRowIds,
      getSelection,
      propertyId,
      rowId,
      runAutoscrollFrame,
      setFocusedCell,
      setSelection,
    ],
  );

  return { onCellPointerDown };
}
