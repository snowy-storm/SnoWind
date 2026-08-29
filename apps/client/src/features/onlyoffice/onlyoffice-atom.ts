import { atom, type PrimitiveAtom } from "jotai";
import type { OnlyOfficeEditorRequest } from "./onlyoffice.utils";

export const onlyOfficeEditorAtom: PrimitiveAtom<OnlyOfficeEditorRequest | null> =
  atom<OnlyOfficeEditorRequest | null>(null);
