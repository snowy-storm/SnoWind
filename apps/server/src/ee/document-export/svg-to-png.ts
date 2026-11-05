import { renderAsync } from '@resvg/resvg-js';

const PNG_EXPORT_MIN_WIDTH = 1200;
const PNG_EXPORT_MAX_WIDTH = 2400;

type SvgMeta = {
  fileExt?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
};

export function isSvgContent(buffer: Uint8Array, meta?: SvgMeta): boolean {
  const ext = meta?.fileExt?.toLowerCase();
  if (ext === '.svg') return true;
  if (meta?.mimeType?.toLowerCase().includes('svg')) return true;
  if (meta?.fileName?.toLowerCase().endsWith('.svg')) return true;

  const head = Buffer.from(buffer.subarray(0, 512))
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart();
  return /<svg[\s>]/i.test(head);
}

function hasFillDeclaration(attrs: string): boolean {
  return (
    /\bfill\s*=/i.test(attrs) || /(?:^|[;"'\s])fill\s*:/i.test(attrs)
  );
}

function splitTopLevel(value: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === sep && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

// Draw.io adaptive colours export as CSS light-dark(light, dark). resvg
// cannot parse that function and falls back to black. Word export always
// uses the light appearance, so keep the first argument.
function resolveLightDark(svg: string): string {
  const needle = /light-dark\s*\(/gi;
  let out = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = needle.exec(svg)) !== null) {
    const openParen = match.index + match[0].length - 1;
    let depth = 1;
    let i = openParen + 1;
    while (i < svg.length && depth > 0) {
      if (svg[i] === '(') depth += 1;
      else if (svg[i] === ')') depth -= 1;
      i += 1;
    }
    if (depth > 0) break;
    const inner = svg.slice(openParen + 1, i - 1);
    const light = splitTopLevel(inner, ',')[0]?.trim() || 'none';
    out += svg.slice(last, match.index) + light;
    last = i;
    needle.lastIndex = i;
  }
  return out + svg.slice(last);
}

// Draw.io also emits style="fill: var(--ge-adaptive-bg, #ffffff)". CSS
// variables override presentation attributes; resvg cannot resolve them and
// falls back to the initial black fill, painting shapes solid black.
function resolveCssVars(svg: string): string {
  let out = svg;
  for (let i = 0; i < 5; i++) {
    const next = out.replace(
      /var\(\s*--[a-zA-Z0-9-]+\s*(?:,\s*((?:[^)(]+|\([^)]*\))*))?\s*\)/gi,
      (_m, fallback: string | undefined) => {
        const value = (fallback || 'none').trim();
        return value || 'none';
      },
    );
    if (next === out) break;
    out = next;
  }
  return out;
}

function readPngSizeFromDataHref(
  href: string,
): { width: number; height: number } | null {
  const match = href.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)/i);
  if (!match) return null;
  try {
    const buf = Buffer.from(match[1].slice(0, 96), 'base64');
    if (buf.length < 24) return null;
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}

// Excalidraw embeds images as <symbol><image width="100%" height="100%"/>
// then references them with <use width height>. resvg does not resolve the
// percentage against the <use> viewport, which crops/stretches screenshots.
// Give the symbol an intrinsic viewBox from the PNG IHDR and absolute image
// dimensions so <use> scales correctly.
function fixExcalidrawSymbolImages(svg: string): string {
  return svg.replace(
    /<symbol(\s[^>]*)?>\s*<image\b([^>]*?)(\/?)>/gi,
    (full, symbolAttrs = '', imageAttrs: string, selfClose: string) => {
      if (!/\bwidth\s*=\s*["']100%["']/i.test(imageAttrs)) return full;
      if (!/\bheight\s*=\s*["']100%["']/i.test(imageAttrs)) return full;

      const href =
        imageAttrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/i)?.[2] ||
        imageAttrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/i)?.[3];
      if (!href) return full;

      const size = readPngSizeFromDataHref(href);
      if (!size) return full;

      let nextSymbolAttrs = symbolAttrs;
      if (!/\bviewBox\s*=/i.test(symbolAttrs)) {
        nextSymbolAttrs = `${symbolAttrs} viewBox="0 0 ${size.width} ${size.height}"`;
      }

      const cleanedImageAttrs = imageAttrs
        .replace(/\swidth\s*=\s*("([^"]*)"|'([^']*)')/gi, '')
        .replace(/\sheight\s*=\s*("([^"]*)"|'([^']*)')/gi, '');
      const close = selfClose ? '/>' : '>';
      return `<symbol${nextSymbolAttrs}><image${cleanedImageAttrs} width="${size.width}" height="${size.height}"${close}`;
    },
  );
}

// SVG's initial fill is black. Draw.io / Excalidraw omit `fill` on unfilled
// shapes, so resvg paints them solid black. Setting fill="none" on the root
// makes those shapes inherit a transparent fill; the white PNG background
// then shows through. Explicit fills on children (and inherited fills on
// <g>) are unchanged.
function withRootFillNone(svg: string): string {
  return svg.replace(/<svg\b([^>]*)>/i, (full, attrs: string) => {
    if (hasFillDeclaration(attrs)) return full;
    return `<svg${attrs} fill="none">`;
  });
}

export function prepareSvgForRaster(svg: string): string {
  // Draw.io stores the editable diagram XML in content=""; it is unused for
  // rendering and can be several MB of base64 that slows XML parsing.
  const stripped = svg.replace(/\scontent=(["'])[\s\S]*?\1/i, '');
  return withRootFillNone(
    fixExcalidrawSymbolImages(
      resolveCssVars(resolveLightDark(stripped)),
    ),
  );
}

function exportWidthForSvg(svg: string): number {
  const widthAttr = svg.match(/<svg\b[^>]*\bwidth="([0-9.]+)(?:px)?"/i)?.[1];
  let width = widthAttr ? Number.parseFloat(widthAttr) : Number.NaN;

  if (!Number.isFinite(width) || width <= 0) {
    const viewBox = svg.match(/<svg\b[^>]*\bviewBox="([^"]+)"/i)?.[1];
    const parts = viewBox?.trim().split(/[\s,]+/);
    width =
      parts && parts.length >= 4
        ? Number.parseFloat(parts[2])
        : PNG_EXPORT_MIN_WIDTH;
  }

  if (!Number.isFinite(width) || width <= 0) {
    return PNG_EXPORT_MIN_WIDTH;
  }

  return Math.min(
    PNG_EXPORT_MAX_WIDTH,
    Math.max(PNG_EXPORT_MIN_WIDTH, Math.round(width)),
  );
}

export async function svgToPng(svgBuffer: Uint8Array): Promise<Buffer> {
  const svg = prepareSvgForRaster(Buffer.from(svgBuffer).toString('utf8'));
  const rendered = await renderAsync(svg, {
    fitTo: { mode: 'width', value: exportWidthForSvg(svg) },
    background: 'white',
    // Helvetica (Draw.io's label font, including Chinese) is aliased to
    // Noto Sans CJK SC in the production image. See docker/fonts.
    font: { loadSystemFonts: true },
  });
  return rendered.asPng();
}
