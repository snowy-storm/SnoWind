import { Injectable, Logger } from '@nestjs/common';
import { validate as isValidUUID } from 'uuid';
import { pageNodeToDocxBuffer } from '@snowind/editor-ext';
import { Page } from '@snowind/db/types/entity.types';
import { jsonToNode } from '../../collaboration/collaboration.util';
import { getProsemirrorContent } from '../../common/helpers/prosemirror/utils';
import { getPageTitle } from '../../integrations/export/utils';
import { StorageService } from '../../integrations/storage/storage.service';
import { AttachmentRepo } from '../../database/repos/attachment/attachment.repo';
import { isSvgContent, svgToPng } from './svg-to-png';
import { mermaidToPng } from './mermaid-to-png';

const FILE_ATTACHMENT_ID_RE =
  /\/(?:api\/)?files\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\/|$|\?)/;

@Injectable()
export class DocxExportService {
  private readonly logger = new Logger(DocxExportService.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly attachmentRepo: AttachmentRepo,
  ) {}

  async exportPageAsDocx(page: Page): Promise<Buffer> {
    const source = getProsemirrorContent(page.content);
    const content = Array.isArray(source.content) ? [...source.content] : [];

    if (page.title) {
      content.unshift({
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: getPageTitle(page.title) }],
      });
    }

    const mermaidImages = new Map<string, Buffer>();
    await this.replaceMermaidBlocks(content, mermaidImages);

    const doc = jsonToNode({
      ...source,
      type: 'doc',
      content,
    });

    return pageNodeToDocxBuffer(doc, (src) =>
      this.resolveImageBuffer(src, mermaidImages),
    );
  }

  private async replaceMermaidBlocks(
    nodes: any[],
    mermaidImages: Map<string, Buffer>,
  ): Promise<void> {
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (!node || typeof node !== 'object') continue;

      const language = String(node.attrs?.language || '').toLowerCase();
      if (node.type === 'codeBlock' && language === 'mermaid') {
        const source = this.collectText(node).trim();
        if (!source) continue;
        try {
          const png = await mermaidToPng(source);
          const key = `mermaid://${mermaidImages.size}`;
          mermaidImages.set(key, png);
          nodes[i] = {
            type: 'image',
            attrs: { src: key, align: 'center' },
          };
        } catch (err) {
          this.logger.debug('Failed to render mermaid for Word export', err);
        }
        continue;
      }

      if (Array.isArray(node.content)) {
        await this.replaceMermaidBlocks(node.content, mermaidImages);
      }
    }
  }

  private collectText(node: any): string {
    if (node?.type === 'text') return node.text || '';
    if (!Array.isArray(node?.content)) return '';
    return node.content.map((child: any) => this.collectText(child)).join('');
  }

  private async resolveImageBuffer(
    src: string,
    mermaidImages?: Map<string, Buffer>,
  ): Promise<Uint8Array> {
    if (src.startsWith('mermaid://')) {
      const png = mermaidImages?.get(src);
      if (!png) throw new Error(`Cannot resolve mermaid image: ${src}`);
      return png;
    }
    const attachmentId = this.extractAttachmentId(src);
    if (!attachmentId) {
      throw new Error(`Cannot resolve image source: ${src}`);
    }

    const attachment = await this.attachmentRepo.findById(attachmentId);
    if (!attachment?.filePath) {
      throw new Error(`Attachment not found: ${attachmentId}`);
    }

    let buffer: Buffer;
    try {
      buffer = await this.storageService.read(attachment.filePath);
    } catch (err) {
      this.logger.debug(
        `Failed to read attachment ${attachmentId} for Word export`,
        err,
      );
      throw err;
    }

    // Word cannot embed SVG. Draw.io / Excalidraw (and any other SVG
    // attachment) are rasterized to PNG so they appear as images.
    if (!isSvgContent(buffer, attachment)) {
      return buffer;
    }

    try {
      return await svgToPng(buffer);
    } catch (err) {
      this.logger.debug(
        `Failed to rasterize SVG attachment ${attachmentId} for Word export`,
        err,
      );
      throw err;
    }
  }

  private extractAttachmentId(src: string): string | null {
    if (!src) return null;
    if (isValidUUID(src)) return src;
    const match = src.match(FILE_ATTACHMENT_ID_RE);
    return match?.[1] ?? null;
  }
}
