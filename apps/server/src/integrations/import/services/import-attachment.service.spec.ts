jest.mock('@sindresorhus/slugify', () => ({
  __esModule: true,
  default: (value: string) => value,
}));

jest.mock('p-limit', () => ({
  __esModule: true,
  default: () => (fn: any) => fn(),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ImportAttachmentService } from './import-attachment.service';

const FILE_ID = '11111111-1111-4111-8111-111111111111';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const DRAWIO_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
  'utf-8',
);

function makeService() {
  const uploadStream = jest.fn().mockResolvedValue(undefined);
  const execute = jest.fn().mockResolvedValue(undefined);
  const db = {
    insertInto: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({ execute }),
    }),
  };
  const attachmentQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const service = new ImportAttachmentService(
    { uploadStream } as any,
    db as any,
    attachmentQueue as any,
  );
  return { service, uploadStream, execute };
}

describe('ImportAttachmentService.processAttachments', () => {
  let extractDir: string;

  beforeEach(() => {
    extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snowind-import-'));
  });

  afterEach(() => {
    fs.rmSync(extractDir, { recursive: true, force: true });
  });

  it('stores nested-page images and rewrites them to /api/files urls', async () => {
    const rel = `files/${FILE_ID}/photo.png`;
    const abs = path.join(extractDir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, TINY_PNG);

    const { service, uploadStream, execute } = makeService();
    const html = await service.processAttachments({
      html: `<p><img src="files/${FILE_ID}/photo.png" /></p>`,
      pageRelativePath: 'Parent/Child.md',
      extractDir,
      pageId: 'page-1',
      fileTask: {
        creatorId: 'user-1',
        workspaceId: 'workspace-1',
        spaceId: 'space-1',
      } as any,
      attachmentCandidates: new Map([[rel, abs]]),
    });

    expect(html).toMatch(/src="\/api\/files\/[^"]+\/photo\.png"/);
    expect(html).toMatch(/data-attachment-id="/);
    expect(uploadStream).toHaveBeenCalled();
    expect(execute).toHaveBeenCalled();
  });

  it('restores markdown-flattened drawio files as drawing nodes', async () => {
    const rel = `files/${FILE_ID}/diagram.drawio.svg`;
    const abs = path.join(extractDir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, DRAWIO_SVG);

    const { service } = makeService();
    const html = await service.processAttachments({
      html: `<p><img src="files/${FILE_ID}/diagram.drawio.svg" /></p>`,
      pageRelativePath: 'Parent/Child.md',
      extractDir,
      pageId: 'page-1',
      fileTask: {
        creatorId: 'user-1',
        workspaceId: 'workspace-1',
        spaceId: 'space-1',
      } as any,
      attachmentCandidates: new Map([[rel, abs]]),
    });

    expect(html).toContain('data-type="drawio"');
    expect(html).toMatch(/data-src="\/api\/files\/[^"]+\/diagram\.drawio\.svg"/);
  });

  it('keeps existing drawio nodes and does not duplicate nested preview images', async () => {
    const rel = `Export/files/${FILE_ID}/diagram.drawio.svg`;
    const abs = path.join(extractDir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, DRAWIO_SVG);

    const { service, uploadStream } = makeService();
    const html = await service.processAttachments({
      html: `<div data-type="drawio" data-src="files/${FILE_ID}/diagram.drawio.svg" data-attachment-id="${FILE_ID}"><img src="files/${FILE_ID}/diagram.drawio.svg" /></div>`,
      pageRelativePath: 'Export/Parent/Child.md',
      extractDir,
      pageId: 'page-1',
      fileTask: {
        creatorId: 'user-1',
        workspaceId: 'workspace-1',
        spaceId: 'space-1',
      } as any,
      attachmentCandidates: new Map([[rel, abs]]),
    });

    expect(html).toContain('data-type="drawio"');
    expect(html.match(/data-type="drawio"/g)?.length).toBe(1);
    expect(uploadStream).toHaveBeenCalledTimes(1);
  });
});
