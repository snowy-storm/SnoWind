import slugify from "@sindresorhus/slugify";
import type { TFunction } from "i18next";

/**
 * Display title for a page, with a base-aware empty-title fallback: bases
 * fall back to "Untitled base", normal pages to "Untitled". Single chokepoint
 * so the fallback stays consistent across the UI.
 */
export function getPageTitle(
  title: string | null | undefined,
  isBase: boolean | undefined,
  t: TFunction,
  drawingType?: string | null,
  fileType?: string | null,
): string {
  if (title) return title;
  if (isBase) return t("Untitled base");
  if (drawingType === "mindmap") return t("Untitled mind map");
  if (drawingType) return t("Untitled drawing");
  return t("Untitled");
}

export function isPdfPage(page?: {
  fileType?: string | null;
} | null): boolean {
  return page?.fileType === "pdf";
}

export function isWordPage(page?: {
  fileType?: string | null;
} | null): boolean {
  return page?.fileType === "word";
}

export function isSpreadsheetPage(page?: {
  fileType?: string | null;
} | null): boolean {
  return page?.fileType === "spreadsheet";
}

export function isSlidePage(page?: {
  fileType?: string | null;
} | null): boolean {
  return page?.fileType === "slide";
}

export function isFilePage(page?: {
  fileType?: string | null;
} | null): boolean {
  return (
    isPdfPage(page) ||
    isWordPage(page) ||
    isSpreadsheetPage(page) ||
    isSlidePage(page)
  );
}

export type PageFile = {
  src: string;
  name?: string;
  attachmentId?: string;
  size?: number;
  mime?: string;
};

export type PdfPageFile = PageFile;

export function getPageFileFromContent(content: unknown): PageFile | null {
  let parsed = content;
  if (typeof content === "string") {
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const doc = parsed as { content?: Array<{ type?: string; attrs?: Record<string, unknown> }> };
  const node = doc.content?.find(
    (item) => item?.type === "pdf" || item?.type === "attachment" || item?.type === "word",
  );
  const src =
    (typeof node?.attrs?.src === "string" && node.attrs.src) ||
    (typeof node?.attrs?.url === "string" && node.attrs.url) ||
    "";
  const attachmentIdFromAttrs =
    typeof node?.attrs?.attachmentId === "string"
      ? node.attrs.attachmentId
      : undefined;
  const attachmentIdFromSrc = src.match(/\/files\/([^/?#]+)/)?.[1];
  const attachmentId = attachmentIdFromAttrs || attachmentIdFromSrc;
  if (!src && !attachmentId) return null;
  return {
    src: src || (attachmentId ? `/api/files/${attachmentId}` : ""),
    name: typeof node.attrs?.name === "string" ? node.attrs.name : undefined,
    attachmentId,
    size:
      node.attrs?.size != null && !Number.isNaN(Number(node.attrs.size))
        ? Number(node.attrs.size)
        : undefined,
    mime: typeof node.attrs?.mime === "string" ? node.attrs.mime : undefined,
  };
}

export function getPdfFileFromPageContent(content: unknown): PdfPageFile | null {
  return getPageFileFromContent(content);
}

const buildPageSlug = (pageSlugId: string, pageTitle?: string): string => {
  const titleSlug = slugify(pageTitle?.substring(0, 70) || "untitled", {
    customReplacements: [
      ["♥", ""],
      ["🦄", ""],
    ],
  });

  return `${titleSlug}-${pageSlugId}`;
};

export const buildPageUrl = (
  spaceName: string,
  pageSlugId: string,
  pageTitle?: string,
  anchorId?: string,
): string => {
  let url: string;
  if (spaceName === undefined) {
    url = `/p/${buildPageSlug(pageSlugId, pageTitle)}`;
  } else {
    url = `/s/${spaceName}/p/${buildPageSlug(pageSlugId, pageTitle)}`;
  }
  return anchorId ? `${url}#${anchorId}` : url;
};

export const buildSharedPageUrl = (opts: {
  shareId: string;
  pageSlugId: string;
  pageTitle?: string;
  anchorId?: string;
}): string => {
  const { shareId, pageSlugId, pageTitle, anchorId } = opts;
  let url: string;
  if (!shareId) {
    url = `/share/p/${buildPageSlug(pageSlugId, pageTitle)}`;
  } else {
    url = `/share/${shareId}/p/${buildPageSlug(pageSlugId, pageTitle)}`;
  }
  return anchorId ? `${url}#${anchorId}` : url;
};
