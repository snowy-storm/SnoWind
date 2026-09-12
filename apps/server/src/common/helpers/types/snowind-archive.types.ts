export const SNOWIND_ARCHIVE_SOURCE = 'snowind-archive' as const;
export const SNOWIND_ARCHIVE_FORMAT_VERSION = 1;

export type SnowindArchiveSpaceInfo = {
  id: string;
  name: string;
};

export type SnowindArchiveManifest = {
  formatVersion: number;
  source: typeof SNOWIND_ARCHIVE_SOURCE;
  appVersion: string;
  exportedAt: string;
  space: SnowindArchiveSpaceInfo;
  /** Parent-before-child page order */
  pageIds: string[];
  attachmentIds: string[];
};

export type SnowindArchivePage = {
  id: string;
  slugId: string;
  title: string | null;
  icon: string | null;
  coverPhoto: string | null;
  position: string;
  parentPageId: string | null;
  isBase: boolean;
  drawingType: string | null;
  fileType: string | null;
  content: unknown;
  attachmentIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type SnowindArchiveAttachmentMeta = {
  id: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  fileExt: string | null;
  pageId: string | null;
  type: string;
};

export type SnowindArchiveBaseProperty = {
  id: string;
  name: string;
  type: string;
  position: string;
  typeOptions: unknown;
  isPrimary: boolean;
  schemaVersion: number;
};

export type SnowindArchiveBaseRow = {
  id: string;
  position: string;
  cells: Record<string, unknown>;
};

export type SnowindArchiveBaseView = {
  id: string;
  name: string;
  type: string;
  position: string;
  config: unknown;
  isDefault: boolean;
  isPrivate: boolean;
};

export type SnowindArchiveBaseData = {
  properties: SnowindArchiveBaseProperty[];
  rows: SnowindArchiveBaseRow[];
  views: SnowindArchiveBaseView[];
};

export function isSnowindArchiveManifest(
  value: unknown,
): value is SnowindArchiveManifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    m.source === SNOWIND_ARCHIVE_SOURCE &&
    typeof m.formatVersion === 'number' &&
    Array.isArray(m.pageIds) &&
    Array.isArray(m.attachmentIds)
  );
}
