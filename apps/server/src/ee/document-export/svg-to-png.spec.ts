import { renderAsync } from '@resvg/resvg-js';
import { isSvgContent, prepareSvgForRaster, svgToPng } from './svg-to-png';

const SAMPLE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <rect x="0" y="0" width="200" height="100" fill="#4C6EF5"/>
</svg>`;

async function centerPixel(svg: string): Promise<[number, number, number, number]> {
  const prepared = prepareSvgForRaster(svg);
  const img = await renderAsync(prepared, {
    fitTo: { mode: 'original' },
    background: 'white',
  });
  const i = (Math.floor(img.height / 2) * img.width + Math.floor(img.width / 2)) * 4;
  const px = img.pixels;
  return [px[i], px[i + 1], px[i + 2], px[i + 3]];
}

describe('svgToPng', () => {
  it('detects SVG from file metadata and content', () => {
    const buffer = Buffer.from(SAMPLE_SVG);
    expect(isSvgContent(buffer, { fileExt: '.svg' })).toBe(true);
    expect(
      isSvgContent(buffer, { fileName: 'diagram.drawio.svg' }),
    ).toBe(true);
    expect(
      isSvgContent(buffer, { mimeType: 'image/svg+xml' }),
    ).toBe(true);
    expect(isSvgContent(buffer)).toBe(true);
    expect(
      isSvgContent(Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        fileExt: '.png',
      }),
    ).toBe(false);
  });

  it('rasterizes SVG to a PNG buffer', async () => {
    const png = await svgToPng(Buffer.from(SAMPLE_SVG));
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(png.length).toBeGreaterThan(50);
  });

  it('rasterizes Draw.io SVG after stripping the content payload', async () => {
    const drawioSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" content="UEsDBBQAAAAIAAAA">
  <rect width="120" height="80" fill="#228BE6"/>
</svg>`;
    const png = await svgToPng(Buffer.from(drawioSvg));
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('renders unfilled shapes as white, not black', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect x="10" y="10" width="80" height="80" stroke="#111111" stroke-width="4"/>
    </svg>`;
    const [r, g, b] = await centerPixel(svg);
    expect([r, g, b]).toEqual([255, 255, 255]);
  });

  it('keeps an explicit fill color', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect x="10" y="10" width="80" height="80" fill="#4C6EF5" stroke="#111111" stroke-width="4"/>
    </svg>`;
    const [r, g, b] = await centerPixel(svg);
    expect(r).toBeLessThan(100);
    expect(b).toBeGreaterThan(200);
  });

  it('resolves Draw.io light-dark fills to the light color', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect x="10" y="10" width="80" height="80" fill="light-dark(#ffffff, #000000)" stroke="light-dark(#000000, #ffffff)" stroke-width="4"/>
    </svg>`;
    const [r, g, b] = await centerPixel(svg);
    expect([r, g, b]).toEqual([255, 255, 255]);
  });

  it('resolves nested rgb() light-dark fills', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect x="10" y="10" width="80" height="80" fill="light-dark(rgb(255, 255, 255), rgb(0, 0, 0))"/>
    </svg>`;
    const [r, g, b] = await centerPixel(svg);
    expect([r, g, b]).toEqual([255, 255, 255]);
  });

  it('keeps a fill inherited from a parent group', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <g fill="#FA5252">
        <rect x="10" y="10" width="80" height="80" stroke="#111111" stroke-width="4"/>
      </g>
    </svg>`;
    const [r, g, b] = await centerPixel(svg);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(120);
    expect(b).toBeLessThan(120);
  });
});
