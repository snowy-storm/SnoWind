import { Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { validate as isValidUUID } from 'uuid';
import { ExportMetadata } from '../../../common/helpers/types/export-metadata.types';

const SKIP_ARCHIVE_FILES = new Set([
  'snowind-metadata.json',
  '.ds_store',
  'thumbs.db',
  'desktop.ini',
]);

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.ico',
  '.avif',
]);

export type DrawingNodeType = 'drawio' | 'excalidraw';

export interface ResolveAttachmentPathOptions {
  attachmentId?: string;
  byBasename?: Map<string, string[]>;
}

export async function buildAttachmentCandidates(
  extractDir: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  async function walk(dir: string) {
    for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(abs);
      } else {
        if (['.md', '.html'].includes(path.extname(ent.name).toLowerCase())) {
          continue;
        }
        if (SKIP_ARCHIVE_FILES.has(ent.name.toLowerCase())) {
          continue;
        }

        const rel = path.relative(extractDir, abs).split(path.sep).join('/');
        map.set(rel, abs);
      }
    }
  }

  await walk(extractDir);
  return map;
}

export function buildAttachmentBasenameIndex(
  attachmentCandidates: Map<string, string>,
): Map<string, string[]> {
  const byBasename = new Map<string, string[]>();
  for (const rel of attachmentCandidates.keys()) {
    const base = path.posix.basename(rel).toLowerCase();
    const list = byBasename.get(base);
    if (list) {
      list.push(rel);
    } else {
      byBasename.set(base, [rel]);
    }
  }
  return byBasename;
}

export function isRemoteOrEmbeddedUrl(raw: string): boolean {
  const value = (raw || '').trim().toLowerCase();
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    value.startsWith('mailto:') ||
    value.startsWith('//')
  );
}

export function getDrawingNodeType(fileName: string): DrawingNodeType | null {
  const lower = fileName.toLowerCase();
  if (
    lower.endsWith('.drawio.svg') ||
    lower.endsWith('.drawio.xml') ||
    lower.endsWith('.drawio')
  ) {
    return 'drawio';
  }
  if (
    lower.endsWith('.excalidraw.svg') ||
    lower.endsWith('.excalidraw.json') ||
    lower.endsWith('.excalidraw')
  ) {
    return 'excalidraw';
  }
  return null;
}

export function isImageFileName(fileName: string): boolean {
  if (getDrawingNodeType(fileName)) {
    return false;
  }
  return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

export function normalizeImportAttachmentRef(raw: string): string {
  let value = (raw || '').trim().replace(/\\/g, '/');
  value = value.split('#')[0].split('?')[0];
  try {
    value = decodeURIComponent(value);
  } catch (err) {
    Logger.warn(
      `URI malformed for attachment path: ${raw}. Falling back to raw path.`,
      'ImportUtils',
    );
  }
  value = value.replace(/^\.?\/+/, '');
  if (value.startsWith('api/files/')) {
    value = value.slice('api/'.length);
  }
  return path.posix.normalize(value);
}

export function resolveRelativeAttachmentPath(
  raw: string,
  pageDir: string,
  attachmentCandidates: Map<string, string>,
  options: ResolveAttachmentPathOptions = {},
): string | null {
  if (!raw) {
    return null;
  }

  const mainRel = normalizeImportAttachmentRef(raw);
  if (!mainRel || mainRel === '.' || mainRel === '..') {
    return null;
  }

  const confluenceStripped = mainRel.replace(
    /^download\/attachments\//,
    'attachments/',
  );

  const fallback = path
    .normalize(path.join(pageDir, mainRel))
    .split(path.sep)
    .join('/');

  if (attachmentCandidates.has(mainRel)) {
    return mainRel;
  }
  if (
    confluenceStripped !== mainRel &&
    attachmentCandidates.has(confluenceStripped)
  ) {
    return confluenceStripped;
  }
  if (attachmentCandidates.has(fallback)) {
    return fallback;
  }

  const filesMatch = findSnoWindFilesCandidate(mainRel, attachmentCandidates);
  if (filesMatch) {
    return filesMatch;
  }

  if (options.attachmentId) {
    const byId = findCandidateByAttachmentId(
      options.attachmentId,
      attachmentCandidates,
      path.posix.basename(mainRel),
    );
    if (byId) {
      return byId;
    }
  }

  const baseName = path.posix.basename(mainRel).toLowerCase();
  if (baseName && options.byBasename) {
    const matches = options.byBasename.get(baseName) || [];
    if (matches.length === 1) {
      return matches[0];
    }
    const normalizedPageDir = pageDir.replace(/\\/g, '/');
    const sameDir = matches.filter((rel) => {
      const dir = path.posix.dirname(rel);
      return (
        dir === normalizedPageDir ||
        (normalizedPageDir === '.' && !rel.includes('/'))
      );
    });
    if (sameDir.length === 1) {
      return sameDir[0];
    }
  }

  return null;
}

function findSnoWindFilesCandidate(
  normalized: string,
  attachmentCandidates: Map<string, string>,
): string | null {
  const match = normalized.match(/(?:^|\/)files\/([0-9a-fA-F-]{36})\/(.+)$/);
  if (!match || !isValidUUID(match[1])) {
    return null;
  }

  const suffix = `files/${match[1]}/${match[2]}`;
  if (attachmentCandidates.has(suffix)) {
    return suffix;
  }

  for (const rel of attachmentCandidates.keys()) {
    if (rel.endsWith(`/${suffix}`)) {
      return rel;
    }
  }

  return null;
}

function findCandidateByAttachmentId(
  attachmentId: string,
  attachmentCandidates: Map<string, string>,
  preferredName?: string,
): string | null {
  if (!isValidUUID(attachmentId)) {
    return null;
  }

  const matches: string[] = [];
  const needle = `/${attachmentId}/`;
  const prefix = `files/${attachmentId}/`;
  for (const rel of attachmentCandidates.keys()) {
    if (rel.startsWith(prefix) || rel.includes(needle)) {
      matches.push(rel);
    }
  }

  if (matches.length === 0) {
    return null;
  }
  if (preferredName) {
    const named = matches.find(
      (rel) => path.posix.basename(rel) === preferredName,
    );
    if (named) {
      return named;
    }
  }
  return matches[0];
}

export function collectCoLocatedMediaPaths(
  pageRelativePath: string,
  attachmentCandidates: Map<string, string>,
): string[] {
  const pageDir = path.posix.dirname(pageRelativePath.replace(/\\/g, '/'));
  const results: string[] = [];

  for (const rel of attachmentCandidates.keys()) {
    const dir = path.posix.dirname(rel);
    const inSameDir =
      dir === pageDir || (pageDir === '.' && !rel.includes('/'));
    if (!inSameDir) {
      continue;
    }
    const fileName = path.posix.basename(rel);
    if (getDrawingNodeType(fileName) || isImageFileName(fileName)) {
      results.push(rel);
    }
  }

  return results;
}

export async function collectMarkdownAndHtmlFiles(
  dir: string,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(current, ent.name);
      if (ent.isDirectory()) {
        await walk(fullPath);
      } else if (
        ['.md', '.html'].includes(path.extname(ent.name).toLowerCase())
      ) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results;
}

export function stripNotionID(fileName: string): string {
  // Handle optional separator (space or dash) + 32 alphanumeric chars at end
  const notionIdPattern = /[ -]?[a-z0-9]{32}$/i;
  // Handle partial UUID format used for duplicate names: "Name abcd-ef12"
  const partialIdPattern = / [a-f0-9]{4}-[a-f0-9]{4}$/i;
  return fileName
    .replace(notionIdPattern, '')
    .replace(partialIdPattern, '')
    .trim();
}

/**
 * Extract a partial Notion UUID suffix from a folder name.
 * Notion adds "{first4}-{last4}" when multiple pages share the same title.
 * e.g. "Cool 324d-35ab" → { prefix: "324d", suffix: "35ab" }
 */
export function extractNotionPartialId(
  folderName: string,
): { prefix: string; suffix: string } | null {
  const match = folderName.match(/ ([a-f0-9]{4})-([a-f0-9]{4})$/i);
  if (!match) return null;
  return { prefix: match[1].toLowerCase(), suffix: match[2].toLowerCase() };
}

export function encodeFilePath(filePath: string): string {
  return filePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export async function readSnoWindMetadata(
  extractDir: string,
): Promise<ExportMetadata | null> {
  const metadataPath = path.join(extractDir, 'snowind-metadata.json');
  try {
    const content = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(content) as ExportMetadata;
    if (metadata.source === 'snowind' && metadata.pages) {
      return metadata;
    }
    return null;
  } catch {
    return null;
  }
}
