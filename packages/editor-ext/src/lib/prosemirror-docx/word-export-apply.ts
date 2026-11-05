/**
 * Applies a saved Word export style.
 *
 * The no-style path in schema.ts does not call this file. Image bytes are not
 * resized here: maxImageWidth is only the on-page display size. SVG diagrams
 * are still rasterized at 1200–2400px before they reach ImageRun, and ImageRun
 * keeps the source aspect ratio.
 */
import {
  AlignmentType,
  BorderStyle,
  Footer,
  HeadingLevel,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  TableLayoutType,
  TextRun,
  WidthType,
} from 'docx';
import type { IParagraphOptions, IRunOptions } from 'docx';
import { Node } from 'prosemirror-model';
import {
  DocxSerializerAsync,
  MarkSerializer,
  NodeSerializerAsync,
  type OptionsAsync,
} from './serializer';
import { writeDocx, createShortId } from './utils';
import { HEADING_OUTLINE_REFERENCE } from './numbering';
import { chineseFont, countTableColumns, equalColumnWidths } from './chinese-styles';

type DocxImageResolver = OptionsAsync['getImageBuffer'];
import {
  contentWidthTwip,
  fontSizePt,
  headingOutlineNumberText,
  imageDisplayWidthPx,
  measureToTwip,
  pageSizeCm,
  cmToTwip,
  type WordExportRenderStyle,
  type WordExportStyle,
  type WordExportTitleStyle,
} from './word-export-style';

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

function alignOf(value: string) {
  if (value === 'center') return AlignmentType.CENTER;
  if (value === 'right') return AlignmentType.RIGHT;
  if (value === 'justify') return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

function hexColor(value: string): string {
  return value.replace('#', '').toLowerCase();
}

function spacingOf(
  type: string,
  val: number | string,
  before: string,
  after: string,
  fontPt: number,
): NonNullable<IParagraphOptions['spacing']> {
  const base = {
    before: measureToTwip(before, fontPt),
    after: measureToTwip(after, fontPt),
  };
  if (type === 'fixed') {
    const pt = typeof val === 'number' ? val : Number.parseFloat(String(val));
    return { ...base, line: Math.round(pt * 20), lineRule: 'exact' };
  }
  if (type === 'multiple') {
    const n = typeof val === 'number' ? val : Number.parseFloat(String(val));
    return { ...base, line: Math.round((Number.isFinite(n) ? n : 1) * 240), lineRule: 'auto' };
  }
  return { ...base, line: 240, lineRule: 'auto' };
}

function titleAt(style: WordExportStyle, level: number): WordExportTitleStyle {
  return style.titleStyle[Math.min(Math.max(level, 1), 4) - 1];
}

function bodyRun(style: WordExportStyle): IRunOptions {
  const body = style.bodyStyle;
  return {
    font: chineseFont(body.fontFamily),
    size: Math.round(fontSizePt(body.fontSize) * 2),
    bold: body.fontBold,
    color: hexColor(body.fontColor),
  };
}

function bodyParagraph(style: WordExportStyle): IParagraphOptions {
  const body = style.bodyStyle;
  const fontPt = fontSizePt(body.fontSize);
  return {
    alignment: alignOf(body.align),
    indent: { firstLine: measureToTwip(body.indentFirst, fontPt) },
    spacing: spacingOf(body.lineSpacingType, body.lineSpacingVal, body.spaceBefore, body.spaceAfter, fontPt),
  };
}

function listRun(style: WordExportStyle): IRunOptions {
  const list = style.listStyle;
  const body = style.bodyStyle;
  const sizePt = list.followBodySize ? fontSizePt(body.fontSize) : fontSizePt(list.fontSize);
  return {
    font: chineseFont(list.followBodyFont ? body.fontFamily : list.fontFamily),
    size: Math.round(sizePt * 2),
    bold: false,
    color: hexColor(body.fontColor),
  };
}

function listParagraph(style: WordExportStyle): IParagraphOptions {
  const body = style.bodyStyle;
  const fontPt = style.listStyle.followBodySize
    ? fontSizePt(body.fontSize)
    : fontSizePt(style.listStyle.fontSize);
  return {
    alignment: alignOf(body.align),
    indent: { left: 0, firstLine: 0 },
    spacing: spacingOf(body.lineSpacingType, body.lineSpacingVal, body.spaceBefore, body.spaceAfter, fontPt),
  };
}

function headingRun(style: WordExportStyle, level: number): IRunOptions {
  const titleStyle = titleAt(style, level);
  return {
    font: chineseFont(titleStyle.fontFamily),
    size: Math.round(fontSizePt(titleStyle.fontSize) * 2),
    bold: titleStyle.fontBold,
    color: hexColor(titleStyle.fontColor),
    italics: false,
  };
}

function headingParagraph(style: WordExportStyle, level: number): IParagraphOptions {
  const titleStyle = titleAt(style, level);
  const fontPt = fontSizePt(titleStyle.fontSize);
  return {
    alignment: alignOf(titleStyle.align),
    indent: { left: 0, firstLine: measureToTwip(titleStyle.indentFirst, fontPt) },
    spacing: spacingOf(
      titleStyle.lineSpacingType,
      titleStyle.lineSpacingVal,
      titleStyle.spaceBefore,
      titleStyle.spaceAfter,
      fontPt,
    ),
    keepNext: true,
    keepLines: !titleStyle.allowBreak,
  };
}

function headingNumberText(level: number): string {
  return headingOutlineNumberText(level);
}

function headingNumbering() {
  return {
    reference: HEADING_OUTLINE_REFERENCE,
    levels: Array.from({ length: 9 }, (_, level) => ({
      level,
      format: 'decimal' as const,
      text: headingNumberText(level + 1),
      alignment: AlignmentType.LEFT,
      style: {
        paragraph: {
          indent: { left: 0, firstLine: 0 },
        },
      },
    })),
  };
}

function listIndent(style: WordExportStyle, level: number) {
  const fontPt = style.listStyle.followBodySize
    ? fontSizePt(style.bodyStyle.fontSize)
    : fontSizePt(style.listStyle.fontSize);
  const hang = measureToTwip(style.listStyle.indentHang, fontPt);
  const first = measureToTwip(style.listStyle.indentFirst, fontPt);
  return {
    left: hang * (level + 1),
    hanging: Math.max(0, hang - first),
  };
}

function inferDocxImageType(src: string): 'jpg' | 'png' | 'gif' | 'bmp' {
  const ext = src.split(/[?#]/)[0].replace(/^.*\./, '').toLowerCase();
  if (ext === 'jpeg' || ext === 'jpg') return 'jpg';
  if (ext === 'gif' || ext === 'bmp' || ext === 'png') return ext;
  return 'png';
}

function sectionConfig(style: WordExportStyle) {
  const size = pageSizeCm(style.page);
  const properties = {
    page: {
      size: {
        width: cmToTwip(size.widthCm),
        height: cmToTwip(size.heightCm),
        orientation: style.page.pageOrient === 'landscape'
          ? PageOrientation.LANDSCAPE
          : PageOrientation.PORTRAIT,
      },
      margin: {
        top: measureToTwip(style.page.marginTop, 12),
        bottom: measureToTwip(style.page.marginBottom, 12),
        left: measureToTwip(style.page.marginLeft, 12),
        right: measureToTwip(style.page.marginRight, 12),
      },
      pageNumbers: { start: style.page.pageNumStart },
    },
  };
  if (!style.page.showPageNum) return { properties };
  return {
    properties,
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: style.page.pageNumPos === 'bottom-right'
              ? AlignmentType.RIGHT
              : AlignmentType.CENTER,
            children: [
              new TextRun({
                children: [PageNumber.CURRENT],
                font: chineseFont('宋体'),
                size: 21,
              }),
            ],
          }),
        ],
      }),
    },
  };
}

function borderOf(weight: string) {
  const pt = Number.parseFloat(weight) || 0.5;
  return {
    style: BorderStyle.SINGLE,
    size: Math.max(1, Math.round(pt * 8)),
    color: '000000',
  };
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto' };

function tableOptions(style: WordExportStyle, node: Node) {
  const columnCount = countTableColumns(node) || 1;
  const contentWidth = contentWidthTwip(style);
  const columnWidths = equalColumnWidths(columnCount, contentWidth);
  const table = style.tableStyle;
  const side = table.borderMode === 'fullLine' && table.borderSideEnable
    ? borderOf(table.borderHeaderWeight)
    : NO_BORDER;
  const line = borderOf(table.borderHeaderWeight);
  const borders = table.borderMode === 'fullLine'
    ? {
        top: borderOf(table.borderTopWeight),
        bottom: borderOf(table.borderBottomWeight),
        left: side,
        right: side,
        insideHorizontal: line,
        insideVertical: side,
      }
    : {
        top: borderOf(table.borderTopWeight),
        bottom: borderOf(table.borderBottomWeight),
        left: NO_BORDER,
        right: NO_BORDER,
        insideHorizontal: NO_BORDER,
        insideVertical: NO_BORDER,
      };
  const fontPt = fontSizePt(table.cellFontSize);
  const cellParagraph = (header: boolean): IParagraphOptions => ({
    alignment: alignOf(header ? table.headerAlign : table.cellTextAlign),
    indent: { left: 0, firstLine: 0 },
    spacing: {
      before: 0,
      after: 0,
      line: Math.round(table.cellLineSpacing * 240),
      lineRule: 'auto',
    },
  });
  const cellRun = (): IRunOptions => ({
    font: chineseFont(table.cellFontFamily),
    size: Math.round(fontPt * 2),
  });

  return {
    tableOptions: {
      width: { size: contentWidth, type: WidthType.DXA },
      columnWidths,
      layout: TableLayoutType.FIXED,
      borders,
    },
    getCellOptions: (cell: Node) => {
      const colspan = Number(cell.attrs.colspan ?? 1) || 1;
      const isHeader = cell.type.name === 'tableHeader';
      const headerBottom = table.borderMode === 'threeLine' ? borderOf(table.borderHeaderWeight) : undefined;
      return {
        width: {
          size: Math.round((5000 * colspan) / columnCount),
          type: WidthType.PERCENTAGE,
        },
        shading: isHeader
          ? { type: ShadingType.CLEAR, fill: hexColor(table.headerBgColor) }
          : undefined,
        borders: isHeader && headerBottom ? { bottom: headerBottom } : undefined,
      };
    },
    getCellParagraphOptions: (cell: Node) => cellParagraph(cell.type.name === 'tableHeader'),
    getCellRunOptions: () => cellRun(),
  };
}

function collectTables(node: Node): Node[] {
  const tables: Node[] = [];
  node.forEach((child) => {
    if (child.type.name === 'table') {
      tables.push(child);
      return;
    }
    child.descendants((desc) => {
      if (desc.type.name === 'table') {
        tables.push(desc);
        return false;
      }
      return undefined;
    });
  });
  return tables;
}

function createStyledNodes(
  style: WordExportRenderStyle,
  base: NodeSerializerAsync,
): NodeSerializerAsync {
  let skipFirstHeadingNumber = Boolean(style.skipFirstHeadingNumber);

  const renderBodyLine: NodeSerializerAsync[string] = (state, node) => {
    const label = node.attrs?.name || node.attrs?.src || node.attrs?.url || 'attachment';
    state.text(label, bodyRun(style));
    state.closeBlock(node, { ...bodyParagraph(style), indent: { firstLine: 0 } });
  };

  const renderImage: NodeSerializerAsync[string] = async (state, node) => {
    const src = node.attrs?.src || node.attrs?.attachmentId;
    if (src) {
      try {
        // Display width only. The embedded buffer stays at its original
        // resolution, and height follows the source aspect ratio.
        state.maxImageWidth = imageDisplayWidthPx(style);
        await state.image(src, 100, 'center', undefined, inferDocxImageType(src));
        state.addParagraphOptions({
          alignment: AlignmentType.CENTER,
          indent: { left: 0, firstLine: 0 },
          spacing: { before: 60, after: 60, line: 240, lineRule: 'auto' },
        });
      } catch {
        // Unrenderable image: skip rather than fail the whole export.
      }
    }
    state.closeBlock(node);
  };

  const renderList = (kind: 'bullet' | 'ordered'): NodeSerializerAsync[string] => async (state, node) => {
    const reference = createShortId();
    const textFor = (level: number) => (
      kind === 'bullet'
        ? style.listStyle.unorderedSymbol
        : `%${level + 1}.`
    );
    state.numbering.push({
      reference,
      levels: Array.from({ length: 9 }, (_, level) => ({
        level,
        format: kind === 'bullet' ? 'bullet' as const : 'decimal' as const,
        text: textFor(level),
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: listIndent(style, level) } },
      })),
    });
    state.currentNumbering = { reference, level: 0 };
    await state.renderContent(node);
    delete state.currentNumbering;
  };

  return {
    ...base,
    async paragraph(state, node) {
      const inList = Boolean(state.currentNumbering);
      const prev = state.defaultRunOpts;
      state.defaultRunOpts = { ...(inList ? listRun(style) : bodyRun(style)), ...prev };
      await state.renderInline(node);
      state.defaultRunOpts = prev;
      state.closeBlock(node, inList ? listParagraph(style) : bodyParagraph(style));
    },
    async heading(state, node) {
      const level = Math.max(1, Math.min(9, node.attrs.level ?? 1));
      const skipNumber = skipFirstHeadingNumber;
      skipFirstHeadingNumber = false;
      const prev = state.defaultRunOpts;
      state.defaultRunOpts = { ...headingRun(style, level), ...prev };
      await state.renderInline(node);
      state.defaultRunOpts = prev;
      const configured = titleAt(style, level);
      const options: IParagraphOptions = {
        ...headingParagraph(style, level),
        ...(level <= 6
          ? { heading: HEADING_LEVELS[level - 1] }
          : { style: `Heading${level}` }),
        ...(!skipNumber && configured.numberEnable
          ? { numbering: { reference: HEADING_OUTLINE_REFERENCE, level: level - 1 } }
          : {}),
      };
      if (!skipNumber && configured.numberEnable) {
        if (!state.numbering.some((item) => item.reference === HEADING_OUTLINE_REFERENCE)) {
          state.numbering.push(headingNumbering());
        }
      }
      state.closeBlock(node, options);
    },
    async blockquote(state, node) {
      await state.renderContent(node, { ...bodyParagraph(style), style: 'IntenseQuote' });
    },
    async codeBlock(state, node) {
      const prev = state.defaultRunOpts;
      state.defaultRunOpts = { ...bodyRun(style), ...prev };
      await state.renderContent(node);
      state.defaultRunOpts = prev;
      state.closeBlock(node, { ...bodyParagraph(style), indent: { firstLine: 0 } });
    },
    async callout(state, node) {
      await state.renderContent(node, { ...bodyParagraph(style), style: 'IntenseQuote' });
    },
    async detailsSummary(state, node) {
      const prev = state.defaultRunOpts;
      state.defaultRunOpts = { ...headingRun(style, 4), ...prev };
      await state.renderInline(node);
      state.defaultRunOpts = prev;
      state.closeBlock(node, {
        heading: HeadingLevel.HEADING_4,
        ...headingParagraph(style, 4),
      });
    },
    image: renderImage,
    drawio: renderImage,
    excalidraw: renderImage,
    mindmap: renderImage,
    video: renderBodyLine,
    audio: renderBodyLine,
    pdf: renderBodyLine,
    attachment: renderBodyLine,
    embed: renderBodyLine,
    youtube: renderBodyLine,
    bulletList: renderList('bullet'),
    taskList: renderList('bullet'),
    orderedList: renderList('ordered'),
    async table(state, node) {
      state.repeatTableHeader = style.tableStyle.repeatHeader;
      await state.table(node, tableOptions(style, node));
    },
    async transclusionSource(state, node) {
      state.repeatTableHeader = style.tableStyle.repeatHeader;
      for (const table of collectTables(node)) {
        // eslint-disable-next-line no-await-in-loop
        await state.table(table, tableOptions(style, table));
      }
    },
  };
}

function headingStyleDef(style: WordExportStyle, level: number) {
  return {
    run: headingRun(style, level),
    paragraph: {
      ...headingParagraph(style, level),
      outlineLevel: level - 1,
    },
  };
}

export async function renderDocxWithStyle(
  doc: Node,
  getImageBuffer: DocxImageResolver,
  style: WordExportRenderStyle,
  baseNodes: NodeSerializerAsync,
  marks: MarkSerializer,
): Promise<Buffer> {
  const serializer = new DocxSerializerAsync(createStyledNodes(style, baseNodes), marks);
  const wordDoc = await serializer.serializeAsync(
    doc,
    { getImageBuffer, sections: [sectionConfig(style)] },
    () => ({
      styles: {
        default: {
          document: {
            run: bodyRun(style),
            paragraph: {
              ...bodyParagraph(style),
              alignment: alignOf(style.page.defaultAlign),
            },
          },
          heading1: headingStyleDef(style, 1),
          heading2: headingStyleDef(style, 2),
          heading3: headingStyleDef(style, 3),
          heading4: headingStyleDef(style, 4),
          heading5: headingStyleDef(style, 5),
          heading6: headingStyleDef(style, 6),
        },
        paragraphStyles: [7, 8, 9].map((level) => ({
          id: `Heading${level}`,
          name: `Heading ${level}`,
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          ...headingStyleDef(style, level),
        })),
      },
    }) as any,
  );
  return writeDocx(wordDoc);
}
