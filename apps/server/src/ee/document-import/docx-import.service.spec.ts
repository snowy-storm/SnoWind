jest.mock('@sindresorhus/slugify', () => ({
  __esModule: true,
  default: (value: string) => value,
}));

import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, ImageRun } from 'docx';
import { load } from 'cheerio';
import { DocxImportService } from './docx-import.service';
import { htmlToJson } from '../../collaboration/collaboration.util';
import {
  normalizeImportHtml,
  normalizeImportedBlocks,
} from '../../integrations/import/utils/import-formatter';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function findNode(json: any, type: string): any | undefined {
  if (!json || typeof json !== 'object') return undefined;
  if (json.type === type) return json;
  if (Array.isArray(json.content)) {
    for (const child of json.content) {
      const found = findNode(child, type);
      if (found) return found;
    }
  }
  return undefined;
}

function toEditorJson(html: string) {
  const $ = load(html);
  normalizeImportHtml($, $.root());
  return htmlToJson($.html() || '');
}

describe('DocxImportService', () => {
  it('converts a simple Word document to HTML', async () => {
    const service = new DocxImportService(
      { upload: jest.fn() } as any,
      { insertAttachment: jest.fn() } as any,
      {} as any,
    );

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [new TextRun('Hello Word import')],
            }),
          ],
        },
      ],
    });
    const buffer = await Packer.toBuffer(doc);

    const html = await service.convertDocxToHtml(
      buffer,
      'workspace',
      'space',
      'page',
      'user',
    );

    expect(html).toContain('Hello Word import');
  });

  it('stores embedded images and emits editor file URLs', async () => {
    const upload = jest.fn().mockResolvedValue(undefined);
    const insertAttachment = jest.fn().mockResolvedValue({});
    const service = new DocxImportService(
      { upload } as any,
      { insertAttachment } as any,
      {} as any,
    );

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new ImageRun({
                  type: 'png',
                  data: TINY_PNG,
                  transformation: { width: 32, height: 32 },
                }),
              ],
            }),
          ],
        },
      ],
    });
    const buffer = await Packer.toBuffer(doc);

    const html = await service.convertDocxToHtml(
      buffer,
      'workspace-1',
      'space-1',
      'page-1',
      'user-1',
    );

    expect(upload).toHaveBeenCalled();
    expect(insertAttachment).toHaveBeenCalledTimes(1);

    const saved = insertAttachment.mock.calls[0][0];
    expect(saved.pageId).toBe('page-1');
    expect(saved.workspaceId).toBe('workspace-1');
    expect(saved.fileExt).toBe('.png');
    expect(saved.filePath).toContain('workspace-1/files/');

    const $ = load(html);
    const $img = $('img').first();
    expect($img.attr('src')).toBe(
      `/api/files/${saved.id}/${saved.fileName}`,
    );
    expect($img.attr('data-attachment-id')).toBe(saved.id);
    expect($img.attr('data-align')).toBe('center');

    const json = toEditorJson(html);
    const image = findNode(json, 'image');
    expect(image).toBeDefined();
    expect(image.attrs.src).toBe(`/api/files/${saved.id}/${saved.fileName}`);
    expect(image.attrs.attachmentId).toBe(saved.id);
  });

  it('converts Word tables to editor table nodes', async () => {
    const service = new DocxImportService(
      { upload: jest.fn() } as any,
      { insertAttachment: jest.fn() } as any,
      {} as any,
    );

    const doc = new Document({
      sections: [
        {
          children: [
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph('Name')],
                    }),
                    new TableCell({
                      children: [new Paragraph('Score')],
                    }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph('Ada')],
                    }),
                    new TableCell({
                      children: [new Paragraph('10')],
                    }),
                  ],
                }),
              ],
            }),
          ],
        },
      ],
    });
    const buffer = await Packer.toBuffer(doc);
    const html = await service.convertDocxToHtml(
      buffer,
      'workspace',
      'space',
      'page',
      'user',
    );

    expect(html).toContain('<table');
    expect(html).toContain('Ada');

    const json = toEditorJson(html);
    const table = findNode(json, 'table');
    expect(table).toBeDefined();
    const row = findNode(table, 'tableRow');
    expect(row).toBeDefined();
    expect(html).toContain('Score');
    const jsonText = JSON.stringify(json);
    expect(jsonText).toContain('Ada');
    expect(jsonText).toContain('Score');
  });
});

describe('normalizeImportedBlocks', () => {
  it('unwraps images and tables from paragraphs so they parse as block nodes', () => {
    const html = `
      <p><img src="/api/files/img-1/photo.png" data-attachment-id="img-1" /></p>
      <p>
        <table>
          <tr><td>A</td><td>B</td></tr>
        </table>
      </p>
    `;
    const $ = load(html);
    normalizeImportedBlocks($, $.root());

    expect($('p > img').length).toBe(0);
    expect($('img').length).toBe(1);
    expect($('p > table').length).toBe(0);
    expect($('table').length).toBe(1);

    const json = htmlToJson($.html() || '');
    expect(findNode(json, 'image')).toBeDefined();
    expect(findNode(json, 'image').attrs.src).toBe(
      '/api/files/img-1/photo.png',
    );
    expect(findNode(json, 'image').attrs.attachmentId).toBe('img-1');
    expect(findNode(json, 'table')).toBeDefined();
  });
});
