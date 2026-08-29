export const ONLYOFFICE_FILE_EXTS = [
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
] as const;

export type OnlyOfficeFileExt = (typeof ONLYOFFICE_FILE_EXTS)[number];

export type OnlyOfficeDocumentType = 'word' | 'cell' | 'slide';

export const ONLYOFFICE_STATUS = {
  EDITING: 1,
  READY_TO_SAVE: 2,
  SAVE_ERROR: 3,
  CLOSED: 4,
  FORCE_SAVE: 6,
  FORCE_SAVE_ERROR: 7,
} as const;
