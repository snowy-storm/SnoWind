import { renderAsync } from '@resvg/resvg-js';

const PNG_EXPORT_WIDTH = 1200;

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
  return withRootFillNone(resolveLightDark(stripped));
}

export async function svgToPng(svgBuffer: Uint8Array): Promise<Buffer> {
  const svg = prepareSvgForRaster(Buffer.from(svgBuffer).toString('utf8'));
  const rendered = await renderAsync(svg, {
    fitTo: { mode: 'width', value: PNG_EXPORT_WIDTH },
    background: 'white',
    font: { loadSystemFonts: true },
  });
  return rendered.asPng();
}
