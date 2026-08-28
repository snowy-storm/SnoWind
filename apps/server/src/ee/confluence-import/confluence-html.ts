import { promises as fs } from 'fs';
import * as path from 'path';
import { Cheerio, CheerioAPI, load } from 'cheerio';
import { getMimeType } from '../../common/helpers';
import type { ImportPageAttachment } from '../../integrations/import/dto/file-task-dto';

const SKIP_DIR_NAMES = new Set(['styles', 'images', 'assets', '__macosx']);
const SKIP_HTML_NAMES = new Set(['index.html', 'sitemap.html']);

const MACRO_CALLOUT_TYPE: Record<string, string> = {
  'confluence-information-macro-information': 'info',
  'confluence-information-macro-note': 'note',
  'confluence-information-macro-tip': 'success',
  'confluence-information-macro-warning': 'warning',
  'confluence-information-macro-error': 'danger',
};

export type ExtractedConfluencePage = {
  title: string;
  contentHtml: string;
  attachments: ImportPageAttachment[];
  breadcrumbParentHref: string | null;
  childHrefs: string[];
};

export function stripHashAndQuery(href: string): string {
  return href.split('#')[0].split('?')[0];
}

export function decodeHref(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

export function titleFromFileName(filePath: string): string {
  const base = path.posix.basename(filePath, path.posix.extname(filePath));
  const withoutId = base.replace(/_\d+$/, '');
  return decodeHref(withoutId).replace(/\+/g, ' ').trim() || base;
}

export function resolveConfluenceHref(
  href: string,
  fromDir: string,
  knownPaths: Iterable<string>,
): string | null {
  const cleaned = decodeHref(stripHashAndQuery(href)).replace(/\\/g, '/');
  if (!cleaned || cleaned.toLowerCase() === 'index.html') {
    return null;
  }

  const known = knownPaths instanceof Set ? knownPaths : new Set(knownPaths);
  const joined = path.posix.normalize(
    fromDir && fromDir !== '.' ? path.posix.join(fromDir, cleaned) : cleaned,
  );

  if (known.has(joined)) {
    return joined;
  }

  const base = path.posix.basename(cleaned);
  for (const candidate of known) {
    if (path.posix.basename(candidate) === base) {
      return candidate;
    }
  }

  return null;
}

export async function listConfluencePageFiles(
  extractDir: string,
): Promise<{ absPath: string; relPath: string }[]> {
  const results: { absPath: string; relPath: string }[] = [];

  async function walk(dir: string) {
    for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIR_NAMES.has(ent.name.toLowerCase())) {
          continue;
        }
        await walk(abs);
        continue;
      }

      if (path.extname(ent.name).toLowerCase() !== '.html') {
        continue;
      }
      if (SKIP_HTML_NAMES.has(ent.name.toLowerCase())) {
        continue;
      }

      const relPath = path.relative(extractDir, abs).split(path.sep).join('/');
      results.push({ absPath: abs, relPath });
    }
  }

  await walk(extractDir);
  return results;
}

export async function findConfluenceIndexHtml(
  extractDir: string,
): Promise<{ absPath: string; dirRel: string } | null> {
  const matches: { absPath: string; dirRel: string }[] = [];

  async function walk(dir: string) {
    for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIR_NAMES.has(ent.name.toLowerCase())) {
          continue;
        }
        await walk(abs);
        continue;
      }
      if (ent.name.toLowerCase() === 'index.html') {
        const dirRel = path
          .relative(extractDir, path.dirname(abs))
          .split(path.sep)
          .join('/');
        matches.push({ absPath: abs, dirRel: dirRel || '.' });
      }
    }
  }

  await walk(extractDir);
  if (!matches.length) {
    return null;
  }
  matches.sort((a, b) => a.dirRel.split('/').length - b.dirRel.split('/').length);
  return matches[0];
}

export function extractConfluencePage(
  html: string,
  filePath: string,
): ExtractedConfluencePage {
  const $ = load(html);
  const $root = $.root();

  const title =
    $root.find('#title-text').first().text().trim() ||
    $root.find('#title-heading').first().text().trim() ||
    $root.find('h1.pagetitle, h1#title-heading').first().text().trim() ||
    stripSpaceSuffix($root.find('title').first().text().trim()) ||
    titleFromFileName(filePath);

  const $content =
    $root.find('#main-content').first().length > 0
      ? $root.find('#main-content').first()
      : $root.find('.wiki-content').first().length > 0
        ? $root.find('.wiki-content').first()
        : $root.find('#bodyContent').first();

  const contentHtml = $content.length ? $content.html() || '' : '';

  return {
    title,
    contentHtml,
    attachments: extractAttachmentList($),
    breadcrumbParentHref: extractBreadcrumbParent($, filePath),
    childHrefs: extractChildHrefs($),
  };
}

/**
 * href (as stored in the index, cleaned) → parent href or null for roots.
 */
export function parseConfluenceIndexParentMap(
  indexHtml: string,
): Map<string, string | null> {
  const $ = load(indexHtml);
  const parentByHref = new Map<string, string | null>();

  $('a[href]').each((_, el) => {
    const href = normalizePageHref($(el).attr('href') || '');
    if (!href) {
      return;
    }

    const $li = $(el).closest('li');
    if (!$li.length) {
      if (!parentByHref.has(href)) {
        parentByHref.set(href, null);
      }
      return;
    }

    const $parentLi = $li.parent().closest('li');
    let parentHref: string | null = null;
    if ($parentLi.length) {
      const parentLink =
        $parentLi.children('a[href]').first().attr('href') ||
        $parentLi.children().find('> a[href]').first().attr('href') ||
        $parentLi.find('a[href]').first().attr('href');
      parentHref = normalizePageHref(parentLink || '');
      if (parentHref === href) {
        parentHref = null;
      }
    }

    if (!parentByHref.has(href) || parentByHref.get(href) == null) {
      parentByHref.set(href, parentHref);
    }
  });

  return parentByHref;
}

export function applyConfluenceMacros(
  $: CheerioAPI,
  $root: Cheerio<any>,
): void {
  $root.find('script, style, .toc-macro, .toc-macro-content, nav.toc').remove();
  $root.find('.confluence-information-macro-icon, .aui-icon.icon-info').remove();

  $root.find('.table-wrap').each((_, el) => {
    const $wrap = $(el);
    const $table = $wrap.children('table').first();
    if ($table.length) {
      $wrap.replaceWith($table);
    }
  });

  $root.find('.confluence-embedded-file-wrapper').each((_, el) => {
    const $wrap = $(el);
    const inner = $wrap.html();
    if (inner) {
      $wrap.replaceWith(inner);
    }
  });

  $root.find('.confluence-information-macro').each((_, el) => {
    const $macro = $(el);
    const classList = ($macro.attr('class') || '').split(/\s+/);
    let calloutType = 'info';
    for (const cls of classList) {
      if (MACRO_CALLOUT_TYPE[cls]) {
        calloutType = MACRO_CALLOUT_TYPE[cls];
        break;
      }
    }

    const $body = $macro.find('.confluence-information-macro-body').first();
    const $wrapper = $('<div>')
      .attr('data-type', 'callout')
      .attr('data-callout-type', calloutType);

    if ($body.length) {
      const children = $body.children();
      if (children.length) {
        children.each((_, child) => {
          $wrapper.append(child);
        });
      } else {
        const text = $body.text().trim();
        if (text) {
          $wrapper.append($('<p>').text(text));
        }
      }
    } else {
      const text = $macro.text().trim();
      if (text) {
        $wrapper.append($('<p>').text(text));
      }
    }

    $macro.replaceWith($wrapper);
  });

  $root.find('.expand-container').each((_, el) => {
    const $expand = $(el);
    const summary =
      $expand.find('.expand-control-text').first().text().trim() ||
      $expand.find('.expand-control').first().text().trim() ||
      'Expand';
    const $content = $expand.find('.expand-content').first();
    const $details = $('<details>');
    $details.append($('<summary>').text(summary));
    const $detailsContent = $('<div>').attr('data-type', 'detailsContent');
    if ($content.length) {
      $detailsContent.append($content.contents());
    }
    $details.append($detailsContent);
    $expand.replaceWith($details);
  });

  $root.find('div.code.panel').each((_, el) => {
    replaceCodePanel($, $(el));
  });

  $root.find('div.codeContent').each((_, el) => {
    const $el = $(el);
    if ($el.closest('div.code.panel, pre').length) {
      return;
    }
    replaceCodePanel($, $el);
  });
}

function replaceCodePanel($: CheerioAPI, $panel: Cheerio<any>): void {
  const $pre = $panel.find('pre').first();
  if (!$pre.length) {
    return;
  }
  const language = extractCodeBrush($pre.attr('data-syntaxhighlighter-params') || '');
  const $code = $('<code>');
  if (language) {
    $code.attr('class', `language-${language}`);
  }
  $code.text($pre.text());
  $panel.replaceWith($('<pre>').append($code));
}

function extractAttachmentList($: CheerioAPI): ImportPageAttachment[] {
  const attachments: ImportPageAttachment[] = [];
  const seen = new Set<string>();

  const $section = findAttachmentsSection($);
  if (!$section.length) {
    return attachments;
  }

  $section.find('a[href]').each((_, el) => {
    const $a = $(el);
    const rawHref = $a.attr('href') || '';
    const href = stripHashAndQuery(decodeHref(rawHref)).replace(/\\/g, '/');
    if (!href || !/attachments\//i.test(href)) {
      return;
    }
    if (seen.has(href)) {
      return;
    }
    seen.add(href);

    const fileName = ($a.text().trim() || path.posix.basename(href)).replace(/\s+/g, ' ');
    const mimeFromText = adjacentMimeType($a);
    attachments.push({
      href,
      fileName,
      mimeType: mimeFromText || getMimeType(fileName),
    });
  });

  return attachments;
}

function findAttachmentsSection($: CheerioAPI) {
  const $byId = $('#attachments');
  if ($byId.length) {
    const $section = $byId.closest('.pageSection');
    return $section.length ? $section : $byId.parent();
  }

  let $match: ReturnType<typeof $> | null = null;
  $('.pageSectionHeader, h2, h3').each((_, el) => {
    if ($match) return;
    const text = $(el).text().trim().toLowerCase();
    if (text.startsWith('attachment')) {
      $match = $(el).closest('.pageSection');
      if (!$match.length) {
        $match = $(el).parent();
      }
    }
  });

  return $match || $.root().find('.greybox').first();
}

function adjacentMimeType($a: Cheerio<any>): string | null {
  const next = $a.get(0)?.nextSibling;
  if (next && next.type === 'text') {
    const textMatch = String((next as { data?: string }).data || '').match(
      /\(([^)]+\/[^)]+)\)/,
    );
    if (textMatch) {
      return textMatch[1].trim();
    }
  }

  const parentHtml = $a.parent().html() || '';
  const fileName = $a.text().trim();
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const aroundLink = parentHtml.match(
    new RegExp(`${escaped}[\\s\\S]{0,80}?\\(([^)]+\\/[^)]+)\\)`),
  );
  if (aroundLink) {
    return aroundLink[1].trim();
  }

  return null;
}

function extractBreadcrumbParent(
  $: CheerioAPI,
  filePath: string,
): string | null {
  const currentBase = path.posix.basename(filePath);
  const hrefs: string[] = [];
  $('#breadcrumbs a[href], ol.breadcrumbs a[href], .breadcrumb a[href]').each(
    (_, el) => {
      const href = normalizePageHref($(el).attr('href') || '');
      if (href && path.posix.basename(href) !== currentBase) {
        hrefs.push(href);
      }
    },
  );
  return hrefs.length ? hrefs[hrefs.length - 1] : null;
}

function extractChildHrefs($: CheerioAPI): string[] {
  const hrefs: string[] = [];
  const seen = new Set<string>();
  $('#page-children a[href], #children-section a[href]').each((_, el) => {
    const href = normalizePageHref($(el).attr('href') || '');
    if (href && !seen.has(href)) {
      seen.add(href);
      hrefs.push(href);
    }
  });
  return hrefs;
}

function normalizePageHref(href: string): string | null {
  const cleaned = decodeHref(stripHashAndQuery(href)).replace(/\\/g, '/');
  if (!cleaned.toLowerCase().endsWith('.html')) {
    return null;
  }
  if (path.posix.basename(cleaned).toLowerCase() === 'index.html') {
    return null;
  }
  return cleaned;
}

function stripSpaceSuffix(title: string): string {
  return title.replace(/\s+[-–—]\s+.*$/, '').trim();
}

function extractCodeBrush(params: string): string {
  const match = params.match(/brush:\s*([a-z0-9_+-]+)/i);
  return match ? match[1].toLowerCase() : '';
}
