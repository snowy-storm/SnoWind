jest.mock('@sindresorhus/slugify', () => ({
  __esModule: true,
  default: (value: string) => value,
}));

import { BadRequestException } from '@nestjs/common';
import { load } from 'cheerio';
import { PdfImportService } from './pdf-import.service';
import { htmlToJson } from '../../collaboration/collaboration.util';
import { normalizeImportHtml } from '../../integrations/import/utils/import-formatter';

function makePdf(text: string): Buffer {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += obj;
  }

  const xrefStart = Buffer.byteLength(body, 'latin1');
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  body += xref;
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

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

describe('PdfImportService', () => {
  const service = new PdfImportService();

  it('converts a text PDF to HTML', async () => {
    const html = await service.convertPdfToHtml(
      makePdf('Hello PDF import'),
      'workspace',
      'space',
      'page',
      'user',
    );

    expect(html).toContain('Hello PDF import');
  });

  it('parses imported PDF HTML into editor nodes', async () => {
    const html = await service.convertPdfToHtml(
      makePdf('Hello PDF import'),
      'workspace',
      'space',
      'page',
      'user',
    );

    const json = toEditorJson(html);
    expect(findNode(json, 'paragraph')).toBeDefined();
    expect(JSON.stringify(json)).toContain('Hello PDF import');
  });

  it('rejects a file that is not a PDF', async () => {
    await expect(
      service.convertPdfToHtml(
        Buffer.from('not a pdf'),
        'workspace',
        'space',
        'page',
        'user',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
