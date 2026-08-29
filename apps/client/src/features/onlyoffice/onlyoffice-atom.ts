import { atom } from "jotai";
import type { OnlyOfficeEditorRequest } from "./onlyoffice.utils";

export const onlyOfficeEditorAtom = atom(
  null as OnlyOfficeEditorRequest | null,
);
