export const ONLYOFFICE_FILE_EXTS = [
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
] as const;

export type OnlyOfficeEditorMode = "view" | "edit";

export type OnlyOfficeEditorRequest = {
  attachmentId: string;
  fileName?: string;
  shareJwt?: string;
  mode?: OnlyOfficeEditorMode;
};

export type OnlyOfficeConfigResponse = {
  documentServerUrl: string;
  config: Record<string, unknown> & { token?: string };
};

export function normalizeOfficeExt(fileNameOrExt?: string): string {
  if (!fileNameOrExt) return "";
  const raw = fileNameOrExt.trim().toLowerCase();
  return raw.includes(".") ? `.${raw.split(".").pop()}` : `.${raw}`;
}

export function isOnlyOfficeFile(
  fileNameOrExt?: string,
  mimeType?: string,
): boolean {
  const ext = normalizeOfficeExt(fileNameOrExt);
  if ((ONLYOFFICE_FILE_EXTS as readonly string[]).includes(ext)) {
    return true;
  }

  const mime = mimeType?.toLowerCase() ?? "";
  return (
    mime === "application/msword" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.ms-powerpoint" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  );
}

export function getShareAttachmentJwt(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.searchParams.get("jwt") || undefined;
  } catch {
    return undefined;
  }
}
