import {
  AlignmentType,
  convertMillimetersToTwip,
  Footer,
  PageNumber,
  PageOrientation,
  Paragraph,
  TextRun,
  WidthType,
} from 'docx';
import type { IParagraphOptions, IRunOptions } from 'docx';

/** A4 page width (210mm) in twips. */
export const PAGE_WIDTH_TWIPS = convertMillimetersToTwip(210);

/** A4 page height (297mm) in twips. */
export const PAGE_HEIGHT_TWIPS = convertMillimetersToTwip(297);

/** Top / bottom margin: 2.54cm. */
export const MARGIN_Y_TWIPS = convertMillimetersToTwip(25.4);

/** Left / right margin: 3.18cm. */
export const MARGIN_X_TWIPS = convertMillimetersToTwip(31.8);

/** Usable content width between left and right margins. */
export const PAGE_CONTENT_WIDTH_TWIPS = PAGE_WIDTH_TWIPS - MARGIN_X_TWIPS * 2;

/**
 * Content width in CSS pixels (96dpi) for docx ImageRun transformation.
 * Matches page content width so images can be “与页宽等宽”.
 */
export const PAGE_CONTENT_WIDTH_PX = Math.round(
  (PAGE_CONTENT_WIDTH_TWIPS / 1440) * 96,
);

/** Chinese 字号 → docx half-points. */
export const FONT_SIZE = {
  /** 三号 = 16pt */
  sanHao: 32,
  /** 小三 = 15pt */
  xiaoSan: 30,
  /** 四号 = 14pt */
  siHao: 28,
  /** 小四 = 12pt */
  xiaoSi: 24,
  /** 五号 = 10.5pt */
  wuHao: 21,
} as const;

export const FONT = {
  heiTi: '黑体',
  fangSong: '仿宋',
  songTi: '宋体',
} as const;

/** Single line spacing; 段前 / 段后 also one line (240 twips). */
export const SINGLE_LINE_SPACING: NonNullable<IParagraphOptions['spacing']> = {
  before: 240,
  after: 240,
  line: 240,
  lineRule: 'auto',
};

/** First-line indent of 2 Chinese characters at 小四 (12pt × 2). */
export const BODY_FIRST_LINE_INDENT = 480;

/** Light gray fill for table header cells. */
export const TABLE_HEADER_FILL = 'D9D9D9';

export function chineseFont(eastAsia: string): IRunOptions['font'] {
  return {
    ascii: eastAsia,
    eastAsia,
    hAnsi: eastAsia,
    cs: eastAsia,
  };
}

export function headingRunOptions(level: number): IRunOptions {
  let size: number = FONT_SIZE.siHao;
  if (level <= 3) size = FONT_SIZE.sanHao;
  else if (level <= 6) size = FONT_SIZE.xiaoSan;

  return {
    font: chineseFont(FONT.heiTi),
    size,
    color: '000000',
    bold: false,
    italics: false,
  };
}

export function headingParagraphOptions(): IParagraphOptions {
  return {
    alignment: AlignmentType.LEFT,
    indent: { left: 0, firstLine: 0 },
    spacing: SINGLE_LINE_SPACING,
  };
}

export function bodyParagraphOptions(): IParagraphOptions {
  return {
    alignment: AlignmentType.LEFT,
    indent: { firstLine: BODY_FIRST_LINE_INDENT },
    spacing: SINGLE_LINE_SPACING,
  };
}

export function bodyRunOptions(): IRunOptions {
  return {
    font: chineseFont(FONT.fangSong),
    size: FONT_SIZE.xiaoSi,
  };
}

export function tableHeaderRunOptions(): IRunOptions {
  return {
    font: chineseFont(FONT.heiTi),
    size: FONT_SIZE.wuHao,
  };
}

export function tableBodyRunOptions(): IRunOptions {
  return {
    font: chineseFont(FONT.songTi),
    size: FONT_SIZE.wuHao,
  };
}

export function tableCellParagraphOptions(): IParagraphOptions {
  return {
    alignment: AlignmentType.LEFT,
    indent: { left: 0, firstLine: 0 },
    spacing: {
      before: 0,
      after: 0,
      line: 240,
      lineRule: 'auto',
    },
  };
}

export function equalColumnWidths(
  columnCount: number,
  totalWidth = PAGE_CONTENT_WIDTH_TWIPS,
): number[] {
  if (columnCount <= 0) return [];
  const base = Math.floor(totalWidth / columnCount);
  const widths = Array.from({ length: columnCount }, () => base);
  // Absorb rounding remainder on the last column so the table stays page-wide.
  widths[columnCount - 1] += totalWidth - base * columnCount;
  return widths;
}

export function countTableColumns(node: {
  firstChild?: { forEach: (fn: (cell: { attrs: Record<string, unknown> }) => void) => void } | null;
}): number {
  const row = node.firstChild;
  if (!row) return 0;
  let cols = 0;
  row.forEach((cell) => {
    cols += Number(cell.attrs.colspan ?? 1) || 1;
  });
  return cols;
}

export function createExportSectionConfig() {
  return {
    properties: {
      page: {
        size: {
          width: PAGE_WIDTH_TWIPS,
          height: PAGE_HEIGHT_TWIPS,
          orientation: PageOrientation.PORTRAIT,
        },
        margin: {
          top: MARGIN_Y_TWIPS,
          bottom: MARGIN_Y_TWIPS,
          left: MARGIN_X_TWIPS,
          right: MARGIN_X_TWIPS,
        },
      },
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                children: [PageNumber.CURRENT],
                font: chineseFont(FONT.songTi),
                size: FONT_SIZE.wuHao,
              }),
            ],
          }),
        ],
      }),
    },
  };
}

export { AlignmentType, WidthType };
