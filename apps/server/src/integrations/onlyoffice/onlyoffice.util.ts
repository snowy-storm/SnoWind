import {
  ONLYOFFICE_FILE_EXTS,
  OnlyOfficeDocumentType,
  OnlyOfficeFileExt,
} from './onlyoffice.constants';

const WORD_EXTS = new Set(['.doc', '.docx']);
const CELL_EXTS = new Set(['.xls', '.xlsx']);
const SLIDE_EXTS = new Set(['.ppt', '.pptx']);

export function normalizeFileExt(fileNameOrExt: string): string {
  const raw = fileNameOrExt.trim().toLowerCase();
  if (!raw) return '';
  const ext = raw.includes('.') ? `.${raw.split('.').pop()}` : `.${raw}`;
  return ext;
}

export function isOnlyOfficeFile(fileNameOrExt: string, mimeType?: string): boolean {
  const ext = normalizeFileExt(fileNameOrExt);
  if ((ONLYOFFICE_FILE_EXTS as readonly string[]).includes(ext)) {
    return true;
  }

  const mime = mimeType?.toLowerCase() ?? '';
  return (
    mime === 'application/msword' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.ms-powerpoint' ||
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime ===
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  );
}

export function getOnlyOfficeDocumentType(
  fileNameOrExt: string,
): OnlyOfficeDocumentType | null {
  const ext = normalizeFileExt(fileNameOrExt);
  if (WORD_EXTS.has(ext)) return 'word';
  if (CELL_EXTS.has(ext)) return 'cell';
  if (SLIDE_EXTS.has(ext)) return 'slide';
  return null;
}

export function isSameOfficeFamily(extA: string, extB: string): boolean {
  const a = getOnlyOfficeDocumentType(extA);
  const b = getOnlyOfficeDocumentType(extB);
  return a !== null && a === b;
}

export function buildDocumentKey(
  attachmentId: string,
  updatedAt: Date | string,
): string {
  const ts =
    updatedAt instanceof Date
      ? updatedAt.getTime()
      : new Date(updatedAt).getTime();
  const id = attachmentId.replace(/-/g, '');
  return `${id}${ts}`.slice(0, 128);
}

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function fileExtFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return normalizeFileExt(pathname);
  } catch {
    return normalizeFileExt(url.split('?')[0]);
  }
}

export function isOfficeExt(ext: string): ext is OnlyOfficeFileExt {
  return (ONLYOFFICE_FILE_EXTS as readonly string[]).includes(
    normalizeFileExt(ext),
  );
}
