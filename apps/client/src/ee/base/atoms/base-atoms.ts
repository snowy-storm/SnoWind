import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import { EditingCell, FilterNode, FocusedCell } from "@/ee/base/types/base.types";
import type { CellClipboardPayload } from "@/ee/base/utils/cell-clipboard";
import type { CellSelection } from "@/ee/base/utils/cell-selection";

// Atoms are scoped per-base via `pageId` so that two BaseTable instances on
// the same page don't share UI state.

export const activeViewIdAtomFamily = atomFamily((_pageId: string) =>
  atom<string | null>(null),
);

export const editingCellAtomFamily = atomFamily((_pageId: string) =>
  atom<EditingCell>(null),
);

export type FormulaEditorTarget = {
  propertyId: string;
  rowId: string | null;
} | null;

export const activeFormulaEditorAtomFamily = atomFamily((_pageId: string) =>
  atom<FormulaEditorTarget>(null),
);

export const activePropertyMenuAtomFamily = atomFamily((_pageId: string) =>
  atom<string | null>(null),
);

export const propertyMenuDirtyAtomFamily = atomFamily((_pageId: string) =>
  atom<boolean>(false),
);

export const propertyMenuCloseRequestAtomFamily = atomFamily((_pageId: string) =>
  atom<number>(0),
);

export const selectedRowIdsAtomFamily = atomFamily((_pageId: string) =>
  atom<Set<string>>(new Set<string>()),
);

export const lastToggledRowIndexAtomFamily = atomFamily((_pageId: string) =>
  atom<number | null>(null),
);

export const focusedCellAtomFamily = atomFamily((_pageId: string) =>
  atom<FocusedCell>(null),
);

/** Column-scoped multi-cell selection (same property only). */
export const cellSelectionAtomFamily = atomFamily((_pageId: string) =>
  atom<CellSelection | null>(null),
);

/** Transient vertical fill-handle preview (same column). */
export type FillPreview = {
  sourceRowId: string;
  propertyId: string;
  /** Membership keys: `${rowId}\0${propertyId}` */
  cellKeys: ReadonlySet<string>;
} | null;

export const fillPreviewAtomFamily = atomFamily((_pageId: string) =>
  atom<FillPreview>(null),
);

/** In-app cell clipboard (Ctrl/Cmd+C / V). Not scoped per page so paste works across views. */
export type CellClipboard = CellClipboardPayload | null;

export const cellClipboardAtom = atom<CellClipboard>(null);

export type PendingTypeInsert = {
  rowId: string;
  propertyId: string;
  char: string;
} | null;

export const pendingTypeInsertAtom = atom<PendingTypeInsert>(null);

export type KanbanCreateIntent = {
  columnKey: string;
  groupByPropertyId: string;
  destColumnFilter: FilterNode | undefined;
  position?: string;
} | null;

export const kanbanCreateIntentAtomFamily = atomFamily((_pageId: string) =>
  atom<KanbanCreateIntent>(null),
);
