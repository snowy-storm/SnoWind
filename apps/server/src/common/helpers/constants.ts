import * as path from 'path';

export const APP_DATA_PATH = 'data';
const LOCAL_STORAGE_DIR = `${APP_DATA_PATH}/storage`;

export const LOCAL_STORAGE_PATH = path.resolve(
  process.cwd(),
  '..',
  '..',
  LOCAL_STORAGE_DIR,
);

export function getPageTitle(
  title: string | null | undefined,
  isBase?: boolean,
  drawingType?: string | null,
  fileType?: string | null,
): string {
  if (title) return title;
  if (isBase) return 'Untitled base';
  if (drawingType === 'mindmap') return 'Untitled mind map';
  if (drawingType) return 'Untitled drawing';
  return 'untitled';
}
