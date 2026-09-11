import { isFilePage } from "@/features/page/page.utils";
import type { IPage } from "@/features/page/types/page.types";
import type { PageFindTarget } from "@/features/page-find/atoms/page-find-atom";

export function resolvePageFindTarget(
  page: Pick<IPage, "isBase" | "drawingType" | "fileType"> | null | undefined,
): PageFindTarget {
  if (!page) return "none";
  if (isFilePage(page)) return "none";
  if (page.drawingType === "mermaid") return "mermaid";
  if (page.drawingType) return "none";
  if (page.isBase) return "base";
  return "document";
}
