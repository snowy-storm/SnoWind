import { useCallback, useEffect, useMemo, useRef } from "react";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { useSetAtom, type PrimitiveAtom } from "jotai";
import { type IBase, type IBaseProperty, type IBaseRow, type IBaseView, type FilterGroup, type KanbanColumn as KanbanColumnType, KANBAN_CARD_DRAG_TYPE } from "@/ee/base/types/base.types";
import { buildColumnFilter } from "@/ee/base/services/kanban-column-filter";
import { formatKanbanCount } from "@/ee/base/services/format-kanban-count";
import { useKanbanColumnAutoScroll } from "@/ee/base/hooks/use-kanban-autoscroll";
import { useBaseRowsQuery } from "@/ee/base/queries/base-row-query";
import {
  kanbanCreateIntentAtomFamily,
  type KanbanCreateIntent,
} from "@/ee/base/atoms/base-atoms";
import { KanbanColumnHeader } from "@/ee/base/components/kanban/kanban-column-header";
import { KanbanAddCardButton } from "@/ee/base/components/kanban/kanban-add-card-button";
import { KanbanCard } from "@/ee/base/components/kanban/kanban-card";
import classes from "@/ee/base/styles/kanban.module.css";

type KanbanColumnProps = {
  base: IBase;
  view: IBaseView;
  pageId: string;
  column: KanbanColumnType;
  viewFilter: FilterGroup | undefined;
  groupByPropertyId: string;
  groupByProperty: IBaseProperty | undefined;
  canEdit: boolean;
  onOpenRow: (rowId: string) => void;
  onHide: (columnKey: string) => void;
  registerCardRef: (rowId: string, columnKey: string, el: HTMLDivElement | null) => void;
  registerColumnRows: (columnKey: string, rows: IBaseRow[]) => void;
};

export function KanbanColumn({
  base,
  view,
  pageId,
  column,
  viewFilter,
  groupByPropertyId,
  groupByProperty,
  canEdit,
  onOpenRow,
  onHide,
  registerCardRef,
  registerColumnRows,
}: KanbanColumnProps) {
  const filter = useMemo(
    () => buildColumnFilter(viewFilter, groupByPropertyId, column.key),
    [viewFilter, groupByPropertyId, column.key],
  );

  const rowsQuery = useBaseRowsQuery(pageId, filter, undefined);
  const setCreateIntent = useSetAtom(
    kanbanCreateIntentAtomFamily(pageId) as PrimitiveAtom<KanbanCreateIntent>,
  );

  const rows = useMemo(() => {
    const pages = rowsQuery.data?.pages ?? [];
    const seen = new Set<string>();
    const flat: IBaseRow[] = [];
    for (const page of pages) {
      for (const row of page.items) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          flat.push(row);
        }
      }
    }
    return flat.slice().sort((a, b) =>
      a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
    );
  }, [rowsQuery.data]);

  const count = rowsQuery.isSuccess
    ? formatKanbanCount(rows.length, rowsQuery.hasNextPage ?? false)
    : undefined;

  useEffect(() => {
    registerColumnRows(column.key, rows);
  }, [column.key, rows, registerColumnRows]);

  const listRef = useRef<HTMLDivElement>(null);
  useKanbanColumnAutoScroll(listRef, pageId);

  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    return dropTargetForElements({
      element: listEl,
      canDrop: ({ source }) =>
        source.data.type === KANBAN_CARD_DRAG_TYPE && source.data.pageId === pageId,
      getData: () => ({ columnKey: column.key, isColumnBody: true }),
    });
  }, [column.key, pageId]);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const { scrollHeight, scrollTop, clientHeight } = el;
    if (
      scrollHeight - scrollTop - clientHeight < 200 &&
      rowsQuery.hasNextPage &&
      !rowsQuery.isFetchingNextPage
    ) {
      rowsQuery.fetchNextPage();
    }
  }, [rowsQuery.hasNextPage, rowsQuery.isFetchingNextPage, rowsQuery.fetchNextPage]);

  const startCreate = useCallback(
    (placement: "top" | "bottom") => {
      let position: string | undefined;
      try {
        position =
          placement === "top"
            ? generateJitteredKeyBetween(null, rows[0]?.position ?? null)
            : generateJitteredKeyBetween(rows[rows.length - 1]?.position ?? null, null);
      } catch {
        position = undefined;
      }
      setCreateIntent({
        columnKey: column.key,
        groupByPropertyId,
        destColumnFilter: filter,
        position,
      });
    },
    [column.key, filter, groupByPropertyId, rows, setCreateIntent],
  );

  return (
    <div className={classes.column} data-column-key={column.key}>
      <KanbanColumnHeader
        column={column}
        pageId={pageId}
        property={groupByProperty}
        count={count}
        canEdit={canEdit}
        onHide={() => onHide(column.key)}
        onAddCard={() => startCreate("top")}
      />
      <div className={classes.cardList} ref={listRef} onScroll={onScroll}>
        {rows.map((row) => (
          <KanbanCard
            key={row.id}
            base={base}
            view={view}
            row={row}
            columnKey={column.key}
            onOpen={onOpenRow}
            ref={(el) => registerCardRef(row.id, column.key, el)}
          />
        ))}
        {canEdit && <KanbanAddCardButton onAddCard={() => startCreate("bottom")} />}
      </div>
    </div>
  );
}
