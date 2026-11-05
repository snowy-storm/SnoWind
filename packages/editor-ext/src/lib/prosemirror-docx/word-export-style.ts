/**
 * Space-level Word export style.
 *
 * This module is pure data: defaults, presets, validation, and unit conversion.
 * It does not import docx and does not touch image bytes. Raster size for SVG
 * diagrams stays in svgToPng (1200–2400px). A saved style only changes how wide
 * the picture is drawn on the page.
 */

export type WordExportAlign = 'left' | 'center' | 'right' | 'justify';
export type WordExportLineSpacingType = 'single' | 'multiple' | 'fixed';

export interface WordExportPageStyle {
  size: 'A4' | 'A3' | 'custom';
  pageWidth: string;
  pageHeight: string;
  marginTop: string;
  marginBottom: string;
  marginLeft: string;
  marginRight: string;
  pageOrient: 'portrait' | 'landscape';
  showPageNum: boolean;
  pageNumPos: 'bottom-center' | 'bottom-right';
  pageNumStart: number;
  defaultAlign: WordExportAlign;
}

export interface WordExportTitleStyle {
  level: 1 | 2 | 3 | 4;
  fontFamily: string;
  fontSize: string;
  fontBold: boolean;
  fontColor: string;
  align: WordExportAlign;
  lineSpacingType: WordExportLineSpacingType;
  lineSpacingVal: number | string;
  spaceBefore: string;
  spaceAfter: string;
  indentFirst: string;
  numberEnable: boolean;
  numberFormat: string;
  numberSuffix: string;
  allowBreak: boolean;
}

export interface WordExportBodyStyle {
  fontFamily: string;
  fontSize: string;
  fontBold: boolean;
  fontColor: string;
  align: WordExportAlign;
  lineSpacingType: WordExportLineSpacingType;
  lineSpacingVal: number | string;
  indentFirst: string;
  spaceBefore: string;
  spaceAfter: string;
}

export interface WordExportListStyle {
  followBodyFont: boolean;
  followBodySize: boolean;
  fontFamily: string;
  fontSize: string;
  indentHang: string;
  indentFirst: string;
  lineSpacingSync: boolean;
  orderedSymbol: string;
  unorderedSymbol: string;
}

export interface WordExportImageStyle {
  wrapType: 'inline' | 'around';
  maxWidth: string;
  lockRatio: boolean;
}

export interface WordExportTableStyle {
  wrapType: 'inline' | 'around';
  widthMode: 'fitPage' | 'auto';
  borderMode: 'threeLine' | 'fullLine';
  borderTopWeight: string;
  borderHeaderWeight: string;
  borderBottomWeight: string;
  borderSideEnable: boolean;
  headerBgColor: string;
  cellFontFamily: string;
  cellFontSize: string;
  headerAlign: 'left' | 'center' | 'right';
  cellTextAlign: 'left' | 'center' | 'right';
  cellLineSpacing: number;
  repeatHeader: boolean;
}

export interface WordExportStyle {
  page: WordExportPageStyle;
  titleStyle: WordExportTitleStyle[];
  bodyStyle: WordExportBodyStyle;
  listStyle: WordExportListStyle;
  imageStyle: WordExportImageStyle;
  tableStyle: WordExportTableStyle;
}

/** Passed to the renderer only. Never persisted. */
export type WordExportRenderStyle = WordExportStyle & {
  skipFirstHeadingNumber?: boolean;
};

export interface WordExportStyleIssue {
  path: string;
  message: string;
}

export const WORD_EXPORT_FONT_SUGGESTIONS = [
  '微软雅黑',
  '黑体',
  '仿宋',
  '宋体',
  '楷体',
];

/** 一号到小五，磅值与中文排版习惯一致。存盘仍用 pt 字符串。 */
export const CHINESE_FONT_SIZES = [
  { name: '一号', pt: 26 },
  { name: '小一', pt: 24 },
  { name: '二号', pt: 22 },
  { name: '小二', pt: 18 },
  { name: '三号', pt: 16 },
  { name: '小三', pt: 15 },
  { name: '四号', pt: 14 },
  { name: '小四', pt: 12 },
  { name: '五号', pt: 10.5 },
  { name: '小五', pt: 9 },
] as const;

export function formatFontSizePt(pt: number): string {
  const rounded = Math.round(pt * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}pt` : `${rounded}pt`;
}

export function namedFontSize(raw: string): (typeof CHINESE_FONT_SIZES)[number] | undefined {
  return CHINESE_FONT_SIZES.find((item) => formatFontSizePt(item.pt) === raw.trim());
}

export function parseCharacterCount(raw: string): number | null {
  const match = /^(\d+(?:\.\d{1,2})?)字符$/.exec(String(raw).trim());
  if (!match) return null;
  const amount = Number(match[1]);
  if (amount < 0 || amount > 100) return null;
  return amount;
}

export function formatCharacterCount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded}字符`;
}

export type SpacingMeasureUnit = '行' | 'pt';

export function parseSpacingMeasure(raw: string): { amount: number; unit: SpacingMeasureUnit } | null {
  const match = /^(\d+(?:\.\d{1,2})?)(行|pt)$/.exec(String(raw).trim());
  if (!match) return null;
  const amount = Number(match[1]);
  if (amount < 0 || amount > 100) return null;
  return { amount, unit: match[2] as SpacingMeasureUnit };
}

export function formatSpacingMeasure(amount: number, unit: SpacingMeasureUnit): string {
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded}${unit}`;
}

/** 与页面大纲一致：一级 `1.`，更深为 `1.1`，编号后一个空格。 */
export function headingOutlineNumberText(level: number): string {
  const safe = Math.max(1, Math.min(9, Math.round(level) || 1));
  if (safe === 1) return '%1. ';
  return `${Array.from({ length: safe }, (_, index) => `%${index + 1}`).join('.')} `;
}

const MEASURE = /^(\d+(?:\.\d{1,2})?)(cm|pt|行|字符)$/;
const FONT_SIZE = /^(\d+(?:\.\d)?)pt$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const TEMPLATE = /^[^{}]*(\{(seq|parentSeq|parentSeq2|parentSeq3)\}[^{}]*)*$/;

function title(
  level: 1 | 2 | 3 | 4,
  fontSize: string,
  space: string,
  numberFormat: string,
): WordExportTitleStyle {
  return {
    level,
    fontFamily: '黑体',
    fontSize,
    fontBold: true,
    fontColor: '#000000',
    align: 'left',
    lineSpacingType: 'single',
    lineSpacingVal: 1,
    spaceBefore: space,
    spaceAfter: space,
    indentFirst: '0字符',
    numberEnable: true,
    numberFormat,
    numberSuffix: ' ',
    allowBreak: false,
  };
}

const STANDARD: WordExportStyle = {
  page: {
    size: 'A4',
    pageWidth: '21cm',
    pageHeight: '29.7cm',
    marginTop: '2.54cm',
    marginBottom: '2.54cm',
    marginLeft: '2.8cm',
    marginRight: '2.6cm',
    pageOrient: 'portrait',
    showPageNum: true,
    pageNumPos: 'bottom-center',
    pageNumStart: 1,
    defaultAlign: 'justify',
  },
  titleStyle: [
    title(1, '22pt', '1行', '{seq}'),
    title(2, '15pt', '0.5行', '{parentSeq}.{seq}'),
    title(3, '14pt', '0.3行', '{parentSeq}.{parentSeq2}.{seq}'),
    title(4, '12pt', '0.2行', '{parentSeq}.{parentSeq2}.{parentSeq3}.{seq}'),
  ],
  bodyStyle: {
    fontFamily: '仿宋',
    fontSize: '12pt',
    fontBold: false,
    fontColor: '#000000',
    align: 'justify',
    lineSpacingType: 'fixed',
    lineSpacingVal: '22pt',
    indentFirst: '2字符',
    spaceBefore: '0行',
    spaceAfter: '0行',
  },
  listStyle: {
    followBodyFont: true,
    followBodySize: true,
    fontFamily: '宋体',
    fontSize: '12pt',
    indentHang: '2字符',
    indentFirst: '0字符',
    lineSpacingSync: true,
    orderedSymbol: '{seq}.',
    unorderedSymbol: '●',
  },
  imageStyle: {
    wrapType: 'inline',
    maxWidth: '14.4cm',
    lockRatio: true,
  },
  tableStyle: {
    wrapType: 'inline',
    widthMode: 'fitPage',
    borderMode: 'threeLine',
    borderTopWeight: '1.5pt',
    borderHeaderWeight: '0.5pt',
    borderBottomWeight: '1.5pt',
    borderSideEnable: false,
    headerBgColor: '#f0f0f0',
    cellFontFamily: '宋体',
    cellFontSize: '10.5pt',
    headerAlign: 'center',
    cellTextAlign: 'left',
    cellLineSpacing: 1,
    repeatHeader: true,
  },
};

export function standardWordExportStyle(): WordExportStyle {
  return structuredClone(STANDARD);
}

export function presetOfficialStyle(): WordExportStyle {
  const style = standardWordExportStyle();
  style.bodyStyle.lineSpacingType = 'fixed';
  style.bodyStyle.lineSpacingVal = '28pt';
  return style;
}

export function presetTechnicalStyle(): WordExportStyle {
  const style = standardWordExportStyle();
  style.bodyStyle.fontFamily = '宋体';
  style.bodyStyle.lineSpacingType = 'multiple';
  style.bodyStyle.lineSpacingVal = 1.5;
  return style;
}

export function presetBriefStyle(): WordExportStyle {
  const style = standardWordExportStyle();
  style.bodyStyle.fontFamily = '宋体';
  style.bodyStyle.fontSize = '12pt';
  style.bodyStyle.lineSpacingType = 'fixed';
  style.bodyStyle.lineSpacingVal = '16pt';
  style.tableStyle.borderMode = 'fullLine';
  style.tableStyle.borderTopWeight = '0.5pt';
  style.tableStyle.borderHeaderWeight = '0.5pt';
  style.tableStyle.borderBottomWeight = '0.5pt';
  style.tableStyle.borderSideEnable = true;
  return style;
}

export function cmToTwip(cm: number): number {
  return Math.round((cm / 2.54) * 1440);
}

export function measureToCm(raw: string): number | null {
  const match = MEASURE.exec(raw.trim());
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  if (match[2] === 'cm') return n;
  if (match[2] === 'pt') return (n * 2.54) / 72;
  return null;
}

export function measureToTwip(raw: string, fontPt: number): number {
  const match = MEASURE.exec(String(raw).trim());
  if (!match) return 0;
  const n = Number(match[1]);
  if (match[2] === 'pt') return Math.round(n * 20);
  if (match[2] === 'cm') return cmToTwip(n);
  if (match[2] === '行') return Math.round(n * 240);
  return Math.round(n * fontPt * 20);
}

export function fontSizePt(raw: string): number {
  const match = FONT_SIZE.exec(String(raw).trim());
  return match ? Number(match[1]) : 12;
}

export function pageSizeCm(page: WordExportPageStyle): { widthCm: number; heightCm: number } {
  let widthCm = 21;
  let heightCm = 29.7;
  if (page.size === 'A3') {
    widthCm = 29.7;
    heightCm = 42;
  } else if (page.size === 'custom') {
    widthCm = measureToCm(page.pageWidth) ?? 21;
    heightCm = measureToCm(page.pageHeight) ?? 29.7;
  }
  if (page.pageOrient === 'landscape') {
    return { widthCm: heightCm, heightCm: widthCm };
  }
  return { widthCm, heightCm };
}

export function contentWidthTwip(style: WordExportStyle): number {
  const { widthCm } = pageSizeCm(style.page);
  const left = measureToCm(style.page.marginLeft) ?? 0;
  const right = measureToCm(style.page.marginRight) ?? 0;
  return Math.max(0, cmToTwip(widthCm - left - right));
}

/** On-page display width in CSS pixels. Does not change the embedded image buffer. */
export function imageDisplayWidthPx(style: WordExportStyle): number {
  const content = contentWidthTwip(style);
  const max = measureToTwip(style.imageStyle.maxWidth, 12);
  const twip = Math.max(1, Math.min(content || max, max || content));
  return Math.round((twip / 1440) * 96);
}

type IssueList = WordExportStyleIssue[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function push(issues: IssueList, path: string, message: string) {
  issues.push({ path, message });
}

function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: IssueList,
  fallback: T,
): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  push(issues, path, '取值不在允许范围内');
  return fallback;
}

function readBool(value: unknown, path: string, issues: IssueList, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  push(issues, path, '必须是布尔值');
  return fallback;
}

function readFont(value: unknown, path: string, issues: IssueList, fallback: string): string {
  if (typeof value !== 'string') {
    push(issues, path, '必须填写字体名');
    return fallback;
  }
  const font = value.trim();
  if (!font || font.length > 64 || /[\r\n\\/:*?"<>|]/.test(font)) {
    push(issues, path, '字体名无效');
    return fallback;
  }
  return font;
}

function readMeasure(
  value: unknown,
  path: string,
  issues: IssueList,
  fallback: string,
  units?: Array<'cm' | 'pt' | '行' | '字符'>,
): string {
  if (typeof value !== 'string' || !MEASURE.test(value.trim())) {
    push(issues, path, '格式应为数字加单位，如 2.8cm、12pt、1行、2字符');
    return fallback;
  }
  const raw = value.trim();
  const amount = Number(MEASURE.exec(raw)?.[1]);
  if (amount < 0 || amount > 100) {
    push(issues, path, '数值需在 0 到 100 之间');
    return fallback;
  }
  const unit = MEASURE.exec(raw)?.[2] as 'cm' | 'pt' | '行' | '字符';
  if (units && !units.includes(unit)) {
    push(issues, path, `单位必须是${units.join('、')}`);
    return fallback;
  }
  return raw;
}

function readFontSize(value: unknown, path: string, issues: IssueList, fallback: string): string {
  if (typeof value !== 'string' || !FONT_SIZE.test(value.trim())) {
    push(issues, path, '字号格式应为如 12pt');
    return fallback;
  }
  const pt = Number(FONT_SIZE.exec(value.trim())?.[1]);
  if (pt < 5 || pt > 72) {
    push(issues, path, '字号需在 5pt 到 72pt 之间');
    return fallback;
  }
  return `${pt}pt`;
}

function readColor(value: unknown, path: string, issues: IssueList, fallback: string): string {
  if (typeof value !== 'string' || !COLOR.test(value.trim())) {
    push(issues, path, '颜色必须是 # 加 6 位十六进制');
    return fallback;
  }
  return value.trim().toLowerCase();
}

function readTemplate(value: unknown, path: string, issues: IssueList, fallback: string): string {
  if (typeof value !== 'string' || !value.trim() || !TEMPLATE.test(value)) {
    push(issues, path, '模板只允许 {seq}、{parentSeq}、{parentSeq2}、{parentSeq3}');
    return fallback;
  }
  return value;
}

function readLineSpacing(
  type: WordExportLineSpacingType,
  value: unknown,
  path: string,
  issues: IssueList,
): number | string {
  if (type === 'single') {
    if (value !== 1 && value !== '1') {
      push(issues, path, '单倍行距固定为 1');
    }
    return 1;
  }
  if (type === 'multiple') {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n < 0.5 || n > 3) {
      push(issues, path, '倍数行距需在 0.5 到 3 之间');
      return 1.5;
    }
    return Math.round(n * 100) / 100;
  }
  if (typeof value !== 'string' || !/^(\d+(?:\.\d{1,2})?)pt$/.test(value.trim())) {
    push(issues, path, '固定行距格式应为如 22pt');
    return '22pt';
  }
  const pt = Number(/^(\d+(?:\.\d{1,2})?)pt$/.exec(value.trim())?.[1]);
  if (pt < 1 || pt > 100) {
    push(issues, path, '固定行距需在 1pt 到 100pt 之间');
    return '22pt';
  }
  return `${pt}pt`;
}

function readTitle(value: unknown, index: number, issues: IssueList): WordExportTitleStyle {
  const fallback = STANDARD.titleStyle[index];
  const path = `titleStyle.${index}`;
  if (!isRecord(value)) {
    push(issues, path, '标题样式缺失');
    return structuredClone(fallback);
  }
  const lineSpacingType = readEnum(
    value.lineSpacingType,
    ['single', 'multiple', 'fixed'] as const,
    `${path}.lineSpacingType`,
    issues,
    fallback.lineSpacingType,
  );
  return {
    level: (index + 1) as 1 | 2 | 3 | 4,
    fontFamily: readFont(value.fontFamily, `${path}.fontFamily`, issues, fallback.fontFamily),
    fontSize: readFontSize(value.fontSize, `${path}.fontSize`, issues, fallback.fontSize),
    fontBold: readBool(value.fontBold, `${path}.fontBold`, issues, fallback.fontBold),
    fontColor: readColor(value.fontColor, `${path}.fontColor`, issues, fallback.fontColor),
    align: readEnum(value.align, ['left', 'center', 'right', 'justify'] as const, `${path}.align`, issues, fallback.align),
    lineSpacingType,
    lineSpacingVal: readLineSpacing(lineSpacingType, value.lineSpacingVal, `${path}.lineSpacingVal`, issues),
    spaceBefore: readMeasure(value.spaceBefore, `${path}.spaceBefore`, issues, fallback.spaceBefore),
    spaceAfter: readMeasure(value.spaceAfter, `${path}.spaceAfter`, issues, fallback.spaceAfter),
    indentFirst: readMeasure(value.indentFirst, `${path}.indentFirst`, issues, fallback.indentFirst),
    numberEnable: readBool(value.numberEnable, `${path}.numberEnable`, issues, fallback.numberEnable),
    numberFormat: readTemplate(value.numberFormat, `${path}.numberFormat`, issues, fallback.numberFormat),
    numberSuffix: typeof value.numberSuffix === 'string' && value.numberSuffix.length <= 8
      ? value.numberSuffix
      : (push(issues, `${path}.numberSuffix`, '编号后缀最长 8 个字符'), fallback.numberSuffix),
    allowBreak: readBool(value.allowBreak, `${path}.allowBreak`, issues, fallback.allowBreak),
  };
}

export function parseWordExportStyle(
  input: unknown,
): { ok: true; value: WordExportStyle } | { ok: false; errors: WordExportStyleIssue[] } {
  const issues: IssueList = [];
  if (!isRecord(input)) {
    return { ok: false, errors: [{ path: '', message: '配置必须是对象' }] };
  }

  const pageIn = isRecord(input.page) ? input.page : (push(issues, 'page', '缺少页面配置'), {});
  const pageFallback = STANDARD.page;
  const size = readEnum(pageIn.size, ['A4', 'A3', 'custom'] as const, 'page.size', issues, pageFallback.size);
  const page: WordExportPageStyle = {
    size,
    pageWidth: readMeasure(pageIn.pageWidth, 'page.pageWidth', issues, pageFallback.pageWidth, ['cm', 'pt']),
    pageHeight: readMeasure(pageIn.pageHeight, 'page.pageHeight', issues, pageFallback.pageHeight, ['cm', 'pt']),
    marginTop: readMeasure(pageIn.marginTop, 'page.marginTop', issues, pageFallback.marginTop, ['cm', 'pt']),
    marginBottom: readMeasure(pageIn.marginBottom, 'page.marginBottom', issues, pageFallback.marginBottom, ['cm', 'pt']),
    marginLeft: readMeasure(pageIn.marginLeft, 'page.marginLeft', issues, pageFallback.marginLeft, ['cm', 'pt']),
    marginRight: readMeasure(pageIn.marginRight, 'page.marginRight', issues, pageFallback.marginRight, ['cm', 'pt']),
    pageOrient: readEnum(pageIn.pageOrient, ['portrait', 'landscape'] as const, 'page.pageOrient', issues, pageFallback.pageOrient),
    showPageNum: readBool(pageIn.showPageNum, 'page.showPageNum', issues, pageFallback.showPageNum),
    pageNumPos: readEnum(pageIn.pageNumPos, ['bottom-center', 'bottom-right'] as const, 'page.pageNumPos', issues, pageFallback.pageNumPos),
    pageNumStart: Number.isInteger(pageIn.pageNumStart) && Number(pageIn.pageNumStart) >= 1
      ? Number(pageIn.pageNumStart)
      : (push(issues, 'page.pageNumStart', '页码起始值必须是大于等于 1 的整数'), 1),
    defaultAlign: readEnum(pageIn.defaultAlign, ['left', 'center', 'right', 'justify'] as const, 'page.defaultAlign', issues, pageFallback.defaultAlign),
  };

  const titlesIn = Array.isArray(input.titleStyle) ? input.titleStyle : [];
  if (titlesIn.length !== 4) push(issues, 'titleStyle', '需要 4 级标题样式');
  const titleStyle = [0, 1, 2, 3].map((index) => readTitle(titlesIn[index], index, issues));

  const bodyIn = isRecord(input.bodyStyle) ? input.bodyStyle : (push(issues, 'bodyStyle', '缺少正文样式'), {});
  const bodyFallback = STANDARD.bodyStyle;
  const bodyLineType = readEnum(
    bodyIn.lineSpacingType,
    ['single', 'multiple', 'fixed'] as const,
    'bodyStyle.lineSpacingType',
    issues,
    bodyFallback.lineSpacingType,
  );
  const bodyStyle: WordExportBodyStyle = {
    fontFamily: readFont(bodyIn.fontFamily, 'bodyStyle.fontFamily', issues, bodyFallback.fontFamily),
    fontSize: readFontSize(bodyIn.fontSize, 'bodyStyle.fontSize', issues, bodyFallback.fontSize),
    fontBold: readBool(bodyIn.fontBold, 'bodyStyle.fontBold', issues, bodyFallback.fontBold),
    fontColor: readColor(bodyIn.fontColor, 'bodyStyle.fontColor', issues, bodyFallback.fontColor),
    align: readEnum(bodyIn.align, ['left', 'center', 'right', 'justify'] as const, 'bodyStyle.align', issues, bodyFallback.align),
    lineSpacingType: bodyLineType,
    lineSpacingVal: readLineSpacing(bodyLineType, bodyIn.lineSpacingVal, 'bodyStyle.lineSpacingVal', issues),
    indentFirst: readMeasure(bodyIn.indentFirst, 'bodyStyle.indentFirst', issues, bodyFallback.indentFirst),
    spaceBefore: readMeasure(bodyIn.spaceBefore, 'bodyStyle.spaceBefore', issues, bodyFallback.spaceBefore),
    spaceAfter: readMeasure(bodyIn.spaceAfter, 'bodyStyle.spaceAfter', issues, bodyFallback.spaceAfter),
  };

  const listIn = isRecord(input.listStyle) ? input.listStyle : (push(issues, 'listStyle', '缺少列表样式'), {});
  const listFallback = STANDARD.listStyle;
  const unordered = typeof listIn.unorderedSymbol === 'string' ? listIn.unorderedSymbol : '';
  if ([...unordered].length !== 1) {
    push(issues, 'listStyle.unorderedSymbol', '无序列表符号必须是一个字符');
  }
  const listStyle: WordExportListStyle = {
    followBodyFont: readBool(listIn.followBodyFont, 'listStyle.followBodyFont', issues, listFallback.followBodyFont),
    followBodySize: readBool(listIn.followBodySize, 'listStyle.followBodySize', issues, listFallback.followBodySize),
    fontFamily: readFont(listIn.fontFamily, 'listStyle.fontFamily', issues, listFallback.fontFamily),
    fontSize: readFontSize(listIn.fontSize, 'listStyle.fontSize', issues, listFallback.fontSize),
    indentHang: readMeasure(listIn.indentHang, 'listStyle.indentHang', issues, listFallback.indentHang),
    indentFirst: readMeasure(listIn.indentFirst, 'listStyle.indentFirst', issues, listFallback.indentFirst),
    lineSpacingSync: readBool(listIn.lineSpacingSync, 'listStyle.lineSpacingSync', issues, listFallback.lineSpacingSync),
    orderedSymbol: readTemplate(listIn.orderedSymbol, 'listStyle.orderedSymbol', issues, listFallback.orderedSymbol),
    unorderedSymbol: [...unordered].length === 1 ? unordered : listFallback.unorderedSymbol,
  };

  const imageIn = isRecord(input.imageStyle) ? input.imageStyle : (push(issues, 'imageStyle', '缺少图片样式'), {});
  const imageFallback = STANDARD.imageStyle;
  const imageStyle: WordExportImageStyle = {
    wrapType: readEnum(imageIn.wrapType, ['inline', 'around'] as const, 'imageStyle.wrapType', issues, 'inline'),
    maxWidth: readMeasure(imageIn.maxWidth, 'imageStyle.maxWidth', issues, imageFallback.maxWidth, ['cm', 'pt']),
    lockRatio: readBool(imageIn.lockRatio, 'imageStyle.lockRatio', issues, imageFallback.lockRatio),
  };

  const tableIn = isRecord(input.tableStyle) ? input.tableStyle : (push(issues, 'tableStyle', '缺少表格样式'), {});
  const tableFallback = STANDARD.tableStyle;
  const borderMode = readEnum(
    tableIn.borderMode,
    ['threeLine', 'fullLine'] as const,
    'tableStyle.borderMode',
    issues,
    tableFallback.borderMode,
  );
  const cellLine = typeof tableIn.cellLineSpacing === 'number' ? tableIn.cellLineSpacing : Number(tableIn.cellLineSpacing);
  if (!Number.isFinite(cellLine) || cellLine < 0.5 || cellLine > 3) {
    push(issues, 'tableStyle.cellLineSpacing', '单元格行距倍数需在 0.5 到 3 之间');
  }
  const tableStyle: WordExportTableStyle = {
    wrapType: readEnum(tableIn.wrapType, ['inline', 'around'] as const, 'tableStyle.wrapType', issues, 'inline'),
    widthMode: readEnum(tableIn.widthMode, ['fitPage', 'auto'] as const, 'tableStyle.widthMode', issues, tableFallback.widthMode),
    borderMode,
    borderTopWeight: readMeasure(tableIn.borderTopWeight, 'tableStyle.borderTopWeight', issues, tableFallback.borderTopWeight, ['pt']),
    borderHeaderWeight: readMeasure(tableIn.borderHeaderWeight, 'tableStyle.borderHeaderWeight', issues, tableFallback.borderHeaderWeight, ['pt']),
    borderBottomWeight: readMeasure(tableIn.borderBottomWeight, 'tableStyle.borderBottomWeight', issues, tableFallback.borderBottomWeight, ['pt']),
    borderSideEnable: borderMode === 'threeLine'
      ? false
      : readBool(tableIn.borderSideEnable, 'tableStyle.borderSideEnable', issues, tableFallback.borderSideEnable),
    headerBgColor: readColor(tableIn.headerBgColor, 'tableStyle.headerBgColor', issues, tableFallback.headerBgColor),
    cellFontFamily: readFont(tableIn.cellFontFamily, 'tableStyle.cellFontFamily', issues, tableFallback.cellFontFamily),
    cellFontSize: readFontSize(tableIn.cellFontSize, 'tableStyle.cellFontSize', issues, tableFallback.cellFontSize),
    headerAlign: readEnum(tableIn.headerAlign, ['left', 'center', 'right'] as const, 'tableStyle.headerAlign', issues, tableFallback.headerAlign),
    cellTextAlign: readEnum(tableIn.cellTextAlign, ['left', 'center', 'right'] as const, 'tableStyle.cellTextAlign', issues, tableFallback.cellTextAlign),
    cellLineSpacing: Number.isFinite(cellLine) && cellLine >= 0.5 && cellLine <= 3 ? cellLine : 1,
    repeatHeader: readBool(tableIn.repeatHeader, 'tableStyle.repeatHeader', issues, tableFallback.repeatHeader),
  };

  const draft: WordExportStyle = { page, titleStyle, bodyStyle, listStyle, imageStyle, tableStyle };
  const contentCm = pageSizeCm(page).widthCm - (measureToCm(page.marginLeft) ?? 0) - (measureToCm(page.marginRight) ?? 0);
  const imageCm = measureToCm(imageStyle.maxWidth);
  if (contentCm <= 1) {
    push(issues, 'page.marginLeft', '左右边距过大，版心不足');
  } else if (imageCm != null && imageCm > contentCm + 0.05) {
    push(issues, 'imageStyle.maxWidth', `图片最大宽度不能超过版心 ${contentCm.toFixed(2)}cm`);
  }

  if (issues.length > 0) return { ok: false, errors: issues };
  return { ok: true, value: draft };
}
