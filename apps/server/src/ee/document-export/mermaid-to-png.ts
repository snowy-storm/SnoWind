import { Window, CSSStyleSheet } from 'happy-dom';
import { svgToPng } from './svg-to-png';

type Box = { x: number; y: number; width: number; height: number };

let mermaidModule: Promise<typeof import('mermaid')> | null = null;
let renderSeq = 0;

function measureText(el: { textContent?: string | null }): Box {
  const text = String(el.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
  const fontSize = 16;
  return {
    x: 0,
    y: -fontSize,
    width: Math.max(8, text.length * fontSize * 0.62),
    height: fontSize * 1.35,
  };
}

function parseTranslate(transform: string | null): { x: number; y: number } {
  if (!transform) return { x: 0, y: 0 };
  const match = /translate\(\s*(-?[\d.]+)(?:[,\s]+(-?[\d.]+))?\s*\)/.exec(
    transform,
  );
  return match
    ? { x: parseFloat(match[1]), y: parseFloat(match[2] || '0') }
    : { x: 0, y: 0 };
}

function unionBox(a: Box | null, b: Box | null): Box | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function shiftBox(box: Box | null, dx: number, dy: number): Box | null {
  if (!box) return null;
  return { x: box.x + dx, y: box.y + dy, width: box.width, height: box.height };
}

function elementBBox(el: any): Box {
  const tag = String(el.tagName || '').toLowerCase();
  const t = parseTranslate(el.getAttribute?.('transform') ?? null);

  if (tag === 'text' || tag === 'tspan') {
    return shiftBox(measureText(el), t.x, t.y) as Box;
  }
  if (tag === 'rect' || tag === 'image') {
    return shiftBox(
      {
        x: parseFloat(el.getAttribute('x')) || 0,
        y: parseFloat(el.getAttribute('y')) || 0,
        width: parseFloat(el.getAttribute('width')) || 0,
        height: parseFloat(el.getAttribute('height')) || 0,
      },
      t.x,
      t.y,
    ) as Box;
  }
  if (tag === 'circle') {
    const cx = parseFloat(el.getAttribute('cx')) || 0;
    const cy = parseFloat(el.getAttribute('cy')) || 0;
    const r = parseFloat(el.getAttribute('r')) || 0;
    return shiftBox(
      { x: cx - r, y: cy - r, width: r * 2, height: r * 2 },
      t.x,
      t.y,
    ) as Box;
  }
  if (tag === 'style' || tag === 'defs' || tag === 'marker') {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let box: Box | null = null;
  for (const child of el.children || []) {
    box = unionBox(box, elementBBox(child));
  }
  return shiftBox(box, t.x, t.y) || { x: 0, y: 0, width: 0, height: 0 };
}

function patchSvgElement(el: any) {
  if (!el || el.__swMermaidPatched) return el;
  el.__swMermaidPatched = true;
  el.getBBox = function getBBox() {
    const box = elementBBox(this);
    return { ...box, toJSON() { return this; } };
  };
  el.getComputedTextLength = function getComputedTextLength() {
    return measureText(this).width;
  };
  return el;
}

function installDomGlobals() {
  const win = new Window({ url: 'https://localhost/' });
  const g = globalThis as any;
  g.window = win;
  g.document = win.document;
  g.DOMParser = win.DOMParser;
  g.XMLSerializer = win.XMLSerializer;
  g.HTMLElement = win.HTMLElement;
  g.SVGElement = win.SVGElement;
  g.Element = win.Element;
  g.Node = win.Node;
  g.navigator = win.navigator;
  g.getComputedStyle = win.getComputedStyle.bind(win);
  g.CSSStyleSheet = win.CSSStyleSheet || CSSStyleSheet;

  const origNS = win.document.createElementNS.bind(win.document);
  win.document.createElementNS = ((ns: string, name: string) =>
    patchSvgElement(origNS(ns, name))) as typeof win.document.createElementNS;

  return win;
}

async function loadMermaid() {
  if (!mermaidModule) {
    mermaidModule = (async () => {
      installDomGlobals();
      const mermaid = await import('mermaid');
      mermaid.default.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'neutral',
        htmlLabels: false,
        flowchart: { htmlLabels: false, useMaxWidth: false },
        sequence: { useMaxWidth: false },
        suppressErrorRendering: true,
      } as any);
      return mermaid;
    })();
  }
  return mermaidModule;
}

export async function mermaidToPng(source: string): Promise<Buffer> {
  const mermaid = await loadMermaid();
  const id = `mermaid-export-${++renderSeq}`;
  const { svg } = await mermaid.default.render(id, source);
  return svgToPng(Buffer.from(svg, 'utf8'));
}
