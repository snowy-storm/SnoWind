import { atom } from "jotai";
import { pageFindStateAtom } from "@/features/page-find/atoms/page-find-atom";

/** @deprecated Prefer pageFindStateAtom; kept for any leftover isOpen reads. */
type SearchAndReplaceAtomType = {
  isOpen: boolean;
};

export const searchAndReplaceStateAtom = atom(
  (get): SearchAndReplaceAtomType => ({
    isOpen: get(pageFindStateAtom).isOpen,
  }),
  (_get, set, update: SearchAndReplaceAtomType) => {
    set(pageFindStateAtom, (prev) => ({
      ...prev,
      isOpen: update.isOpen,
      scope: update.isOpen ? prev.scope : "page",
    }));
  },
);
