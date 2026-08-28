import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { processPdf } from '@firecrawl/pdf-inspector';
import { markdownToHtml } from '@snowind/editor-ext';

@Injectable()
export class PdfImportService {
  private readonly logger = new Logger(PdfImportService.name);

  async convertPdfToHtml(
    fileBuffer: Buffer,
    _workspaceId: string,
    _spaceId: string,
    _pageId: string,
    _userId: string,
  ): Promise<string> {
    let markdown = '';
    let pdfType = '';

    try {
      const result = processPdf(fileBuffer);
      pdfType = result.pdfType;
      markdown = (result.markdown || '').trim();

      const title = result.title?.trim();
      if (title) {
        const firstLine = markdown.split('\n')[0] || '';
        if (!firstLine.startsWith('#') && firstLine !== title) {
          markdown = `# ${title}\n\n${markdown}`.trim();
        }
      }
    } catch (err) {
      this.logger.error('Failed to extract text from PDF', err);
      const detail = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Failed to parse PDF file: ${detail}`);
    }

    const isScanned = pdfType === 'Scanned' || pdfType === 'ImageBased';

    if (!markdown) {
      throw new BadRequestException(
        isScanned
          ? 'This PDF appears to be scanned. Text could not be extracted.'
          : 'Could not extract text from this PDF.',
      );
    }

    if (isScanned) {
      this.logger.warn(
        'PDF import extracted some text from a scanned or image-based PDF',
      );
    }

    return await markdownToHtml(markdown);
  }
}
