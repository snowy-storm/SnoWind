jest.mock('@sindresorhus/slugify', () => ({
  __esModule: true,
  default: (value: string) => value,
}));

jest.mock('./mermaid-to-png', () => ({
  mermaidToPng: jest.fn(async () => {
    const { svgToPng } = require('./svg-to-png');
    return svgToPng(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#4C6EF5"/></svg>`,
      ),
    );
  }),
}));

import * as JSZip from 'jszip';
import { DocxExportService } from './docx-export.service';

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <rect x="0" y="0" width="200" height="100" fill="#4C6EF5"/>
</svg>`;

const DIAGRAM_ATTACHMENT_ID = '11111111-1111-4111-8111-111111111111';

describe('DocxExportService', () => {
  const storageService = { read: jest.fn() };
  const attachmentRepo = { findById: jest.fn() };

  function mockSvgAttachment() {
    attachmentRepo.findById.mockResolvedValue({
      id: DIAGRAM_ATTACHMENT_ID,
      filePath: 'workspace/files/diagram.drawio.svg',
      fileExt: '.svg',
      mimeType: 'image/svg+xml',
      fileName: 'diagram.drawio.svg',
    });
    storageService.read.mockResolvedValue(Buffer.from(SAMPLE_SVG));
  }

  async function mediaNames(buffer: Buffer): Promise<string[]> {
    const zip = await JSZip.loadAsync(buffer);
    return Object.keys(zip.files).filter((name) =>
      name.startsWith('word/media/'),
    );
  }

  beforeEach(() => {
    storageService.read.mockReset();
    attachmentRepo.findById.mockReset();
  });

  it('exports a simple page to a Word document', async () => {
    const service = new DocxExportService(
      storageService as any,
      attachmentRepo as any,
    );

    const buffer = await service.exportPageAsDocx({
      title: 'Hello Word',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Body text' }],
          },
        ],
      },
    } as any);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    expect(buffer.length).toBeGreaterThan(100);
  });

  it('does not fail the export when an image cannot be resolved', async () => {
    const service = new DocxExportService(
      storageService as any,
      attachmentRepo as any,
    );
    attachmentRepo.findById.mockResolvedValue(undefined);

    const buffer = await service.exportPageAsDocx({
      title: 'With image',
      content: {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              src: '/api/files/11111111-1111-4111-8111-111111111111/pic.png',
              attachmentId: '11111111-1111-4111-8111-111111111111',
            },
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'After image' }],
          },
        ],
      },
    } as any);

    expect(buffer.subarray(0, 2).toString()).toBe('PK');
  });

  it.each(['drawio', 'excalidraw'] as const)(
    'embeds %s diagrams as PNG images',
    async (type) => {
      const service = new DocxExportService(
        storageService as any,
        attachmentRepo as any,
      );
      mockSvgAttachment();

      const buffer = await service.exportPageAsDocx({
        title: `Page with ${type}`,
        content: {
          type: 'doc',
          content: [
            {
              type,
              attrs: {
                src: `/api/files/${DIAGRAM_ATTACHMENT_ID}/diagram.${type}.svg`,
                attachmentId: DIAGRAM_ATTACHMENT_ID,
              },
            },
          ],
        },
      } as any);

      expect(buffer.subarray(0, 2).toString()).toBe('PK');
      expect(storageService.read).toHaveBeenCalled();
      const media = await mediaNames(buffer);
      expect(media.some((name) => name.endsWith('.png'))).toBe(true);
    },
  );

  it('embeds mermaid diagrams as PNG images', async () => {
    const service = new DocxExportService(
      storageService as any,
      attachmentRepo as any,
    );

    const buffer = await service.exportPageAsDocx({
      title: 'Page with mermaid',
      content: {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'mermaid' },
            content: [
              {
                type: 'text',
                text: 'flowchart LR\n  A[Hello] --> B[World]',
              },
            ],
          },
        ],
      },
    } as any);

    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    const media = await mediaNames(buffer);
    expect(media.some((name) => name.endsWith('.png'))).toBe(true);
  });

  it('exports heading levels 1–9 as Word heading styles', async () => {
    const service = new DocxExportService(
      storageService as any,
      attachmentRepo as any,
    );

    const buffer = await service.exportPageAsDocx({
      title: '',
      content: {
        type: 'doc',
        content: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => ({
          type: 'heading',
          attrs: { level },
          content: [{ type: 'text', text: `Heading ${level}` }],
        })),
      },
    } as any);

    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file('word/document.xml')!.async('string');
    for (const level of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(documentXml).toContain(`Heading${level}`);
      expect(documentXml).toContain(`Heading ${level}`);
    }
  });

  it('applies multilevel list numbering only to numbered headings', async () => {
    const service = new DocxExportService(
      storageService as any,
      attachmentRepo as any,
    );

    const buffer = await service.exportPageAsDocx({
      title: '',
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1, numbered: true },
            content: [{ type: 'text', text: 'One' }],
          },
          {
            type: 'heading',
            attrs: { level: 2, numbered: true },
            content: [{ type: 'text', text: 'Two' }],
          },
        ],
      },
    } as any);

    const zip = await JSZip.loadAsync(buffer);
    const numberingXml = await zip.file('word/numbering.xml')!.async('string');
    expect(numberingXml).toContain('%1');
    expect(numberingXml).toContain('%1.%2');
    expect(numberingXml).toContain('%1.%2.%3.%4.%5.%6.%7.%8.%9');
  });

  it('applies Chinese page margins and a centered footer page number', async () => {
    const service = new DocxExportService(
      storageService as any,
      attachmentRepo as any,
    );

    const buffer = await service.exportPageAsDocx({
      title: 'Margins',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Body' }],
          },
        ],
      },
    } as any);

    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file('word/document.xml')!.async('string');
    // A4 portrait: 210×297mm ≈ 11906×16838 twips
    expect(documentXml).toMatch(/w:pgSz[^>]*w:w="11906"/);
    expect(documentXml).toMatch(/w:pgSz[^>]*w:h="16838"/);
    expect(documentXml).toMatch(/w:pgSz[^>]*w:orient="portrait"/);
    // 2.54cm top/bottom = 1440 twips; 3.18cm left/right ≈ 1802 twips
    expect(documentXml).toMatch(/w:pgMar[^>]*w:top="1440"/);
    expect(documentXml).toMatch(/w:pgMar[^>]*w:bottom="1440"/);
    expect(documentXml).toMatch(/w:pgMar[^>]*w:left="1802"/);
    expect(documentXml).toMatch(/w:pgMar[^>]*w:right="1802"/);

    const footerName = Object.keys(zip.files).find((name) =>
      /^word\/footer\d*\.xml$/i.test(name),
    );
    expect(footerName).toBeTruthy();
    const footerXml = await zip.file(footerName!)!.async('string');
    expect(footerXml).toMatch(/w:fldChar|w:instrText|PAGE/i);
    expect(footerXml).toMatch(/w:jc\s+[^>]*w:val="center"/);
  });

  it('exports only tables from sync blocks and drops other sync content', async () => {
    const service = new DocxExportService(
      storageService as any,
      attachmentRepo as any,
    );

    const buffer = await service.exportPageAsDocx({
      title: '',
      content: {
        type: 'doc',
        content: [
          {
            type: 'transclusionSource',
            attrs: { id: 'sync-1' },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Should not appear' }],
              },
              {
                type: 'table',
                content: [
                  {
                    type: 'tableRow',
                    content: [
                      {
                        type: 'tableHeader',
                        attrs: { colspan: 1, rowspan: 1, colwidth: [100] },
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Header Cell' }],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'tableRow',
                    content: [
                      {
                        type: 'tableCell',
                        attrs: { colspan: 1, rowspan: 1, colwidth: [100] },
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Body Cell' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    } as any);

    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file('word/document.xml')!.async('string');
    expect(documentXml).toContain('Header Cell');
    expect(documentXml).toContain('Body Cell');
    expect(documentXml).not.toContain('Should not appear');
    expect(documentXml).toContain('D9D9D9');
  });
});
