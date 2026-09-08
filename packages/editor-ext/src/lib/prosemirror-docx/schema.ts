import {
  FootnoteReferenceRun,
  HeadingLevel,
  Paragraph,
  ShadingType,
  TableLayoutType,
} from 'docx';
import { Node } from 'prosemirror-model';
import {
  DocxSerializerAsync,
  ImageType,
  MarkSerializer,
  NodeSerializerAsync,
  OptionsAsync,
} from './serializer';
import { writeDocx } from './utils';
import {
  createHeadingNumbering,
  HEADING_OUTLINE_REFERENCE,
} from './numbering';
import {
  AlignmentType,
  WidthType,
  PAGE_CONTENT_WIDTH_PX,
  PAGE_CONTENT_WIDTH_TWIPS,
  headingRunOptions,
  headingParagraphOptions,
  bodyParagraphOptions,
  bodyRunOptions,
  tableHeaderRunOptions,
  tableBodyRunOptions,
  tableCellParagraphOptions,
  equalColumnWidths,
  countTableColumns,
  createExportSectionConfig,
  TABLE_HEADER_FILL,
  SINGLE_LINE_SPACING,
} from './chinese-styles';

const DOCX_IMAGE_TYPES: ImageType[] = ['jpg', 'png', 'gif', 'bmp'];

function inferDocxImageType(src: string): ImageType {
  const ext = src
    .split(/[?#]/)[0]
    .replace(/^.*\./, '')
    .toLowerCase();
  if (ext === 'jpeg') return 'jpg';
  if (DOCX_IMAGE_TYPES.includes(ext as ImageType)) return ext as ImageType;
  return 'png';
}

export type DocxImageResolver = OptionsAsync['getImageBuffer'];

// docx requires a 6-digit hex color (no leading #). Convert #rgb, #rrggbb,
// and rgb()/rgba() inputs to 6-digit hex; return undefined for anything else
// (named colors, hsl, etc.) so the caller omits the color rather than letting
// docx throw "Invalid hex value".
function toDocxColor(input?: string): string | undefined {
  if (!input) return undefined;
  const value = input.trim().toLowerCase();
  const hex = value.startsWith('#') ? value.slice(1) : value;
  if (/^[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return hex
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    const channel = (n: string) =>
      Math.max(0, Math.min(255, parseInt(n, 10)))
        .toString(16)
        .padStart(2, '0');
    return channel(rgb[1]) + channel(rgb[2]) + channel(rgb[3]);
  }
  return undefined;
}

function tableExportOptions(node: Node) {
  const columnCount = countTableColumns(node) || 1;
  const columnWidths = equalColumnWidths(columnCount);

  return {
    tableOptions: {
      width: { size: PAGE_CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
      columnWidths,
      layout: TableLayoutType.FIXED,
    },
    getCellOptions: (cell: Node) => {
      const colspan = Number(cell.attrs.colspan ?? 1) || 1;
      const isHeader = cell.type.name === 'tableHeader';
      return {
        // pct units are fiftieths of a percent (5000 = 100%).
        width: {
          size: Math.round((5000 * colspan) / columnCount),
          type: WidthType.PERCENTAGE,
        },
        shading: isHeader
          ? { type: ShadingType.CLEAR, fill: TABLE_HEADER_FILL }
          : undefined,
      };
    },
    getCellParagraphOptions: () => tableCellParagraphOptions(),
    getCellRunOptions: (cell: Node) =>
      cell.type.name === 'tableHeader'
        ? tableHeaderRunOptions()
        : tableBodyRunOptions(),
  };
}

// Images embed inline (not floated), centered, full content width.
const renderImage: NodeSerializerAsync[string] = async (state, node) => {
  const src = node.attrs?.src || node.attrs?.attachmentId;
  if (src) {
    try {
      state.maxImageWidth = PAGE_CONTENT_WIDTH_PX;
      await state.image(src, 100, 'center', undefined, inferDocxImageType(src));
      state.addParagraphOptions({
        alignment: AlignmentType.CENTER,
        indent: { left: 0, firstLine: 0 },
        spacing: SINGLE_LINE_SPACING,
      });
    } catch {
      // Unrenderable/missing image: skip rather than fail the whole export.
    }
  }
  state.closeBlock(node);
};

// Non-embeddable media render as a labelled line.
const renderFileLine: NodeSerializerAsync[string] = (state, node) => {
  const label =
    node.attrs?.name || node.attrs?.src || node.attrs?.url || 'attachment';
  state.text(label, bodyRunOptions());
  state.closeBlock(node, bodyParagraphOptions());
};

const renderEmbedLine: NodeSerializerAsync[string] = (state, node) => {
  const label = node.attrs?.src || node.attrs?.url || 'embed';
  state.text(label, bodyRunOptions());
  state.closeBlock(node, bodyParagraphOptions());
};

/** Collect table nodes under a sync block; do not descend into nested tables. */
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

export const defaultAsyncNodes: NodeSerializerAsync = {
  text(state, node) {
    state.text(node.text ?? '');
  },
  async paragraph(state, node) {
    const prev = state.defaultRunOpts;
    state.defaultRunOpts = { ...bodyRunOptions(), ...prev };
    await state.renderInline(node);
    state.defaultRunOpts = prev;
    state.closeBlock(node, bodyParagraphOptions());
  },
  async heading(state, node) {
    const level = Math.max(1, Math.min(9, node.attrs.level ?? 1));
    const levelIndex = level - 1;
    const prev = state.defaultRunOpts;
    state.defaultRunOpts = { ...headingRunOptions(level), ...prev };
    await state.renderInline(node);
    state.defaultRunOpts = prev;

    const heading =
      level <= 6
        ? [
            HeadingLevel.HEADING_1,
            HeadingLevel.HEADING_2,
            HeadingLevel.HEADING_3,
            HeadingLevel.HEADING_4,
            HeadingLevel.HEADING_5,
            HeadingLevel.HEADING_6,
          ][levelIndex]
        : undefined;
    const numbered = Boolean(node.attrs?.numbered);
    const options: Record<string, unknown> = {
      ...headingParagraphOptions(),
    };
    if (heading) options.heading = heading;
    if (level > 6) options.style = `Heading${level}`;
    if (numbered) {
      if (
        !state.numbering.some(
          (item) => item.reference === HEADING_OUTLINE_REFERENCE,
        )
      ) {
        state.numbering.push(createHeadingNumbering());
      }
      options.numbering = {
        reference: HEADING_OUTLINE_REFERENCE,
        level: levelIndex,
      };
    }
    state.closeBlock(node, options as any);
  },
  async blockquote(state, node) {
    await state.renderContent(node, {
      ...bodyParagraphOptions(),
      style: 'IntenseQuote',
    });
  },
  async codeBlock(state, node) {
    await state.renderContent(node);
    state.closeBlock(node, {
      ...bodyParagraphOptions(),
      indent: { firstLine: 0 },
    });
  },
  horizontalRule(state, node) {
    state.closeBlock(node, { thematicBreak: true });
    state.closeBlock(node);
  },
  hardBreak(state) {
    state.addRunOptions({ break: 1 });
  },
  async bulletList(state, node) {
    await state.renderList(node, 'bullets');
  },
  async orderedList(state, node) {
    await state.renderList(node, 'numbered');
  },
  async listItem(state, node) {
    await state.renderListItem(node);
  },
  async taskList(state, node) {
    await state.renderList(node, 'bullets');
  },
  async taskItem(state, node) {
    if (state.currentNumbering) {
      state.addParagraphOptions({ numbering: state.currentNumbering });
    }
    state.text(node.attrs?.checked ? '☑ ' : '☐ ');
    await state.renderContent(node);
  },
  async table(state, node) {
    await state.table(node, tableExportOptions(node));
  },
  // SnoWind stores LaTeX in attrs.text.
  mathInline(state, node) {
    state.math(node.attrs?.text ?? '', { inline: true });
  },
  mathBlock(state, node) {
    state.math(node.attrs?.text ?? '', { inline: false, numbered: false });
    state.closeBlock(node);
  },
  image: renderImage,
  drawio: renderImage,
  excalidraw: renderImage,
  mindmap: renderImage,
  video: renderFileLine,
  audio: renderFileLine,
  pdf: renderFileLine,
  attachment: renderFileLine,
  embed: renderEmbedLine,
  youtube: renderEmbedLine,
  async callout(state, node) {
    await state.renderContent(node, {
      ...bodyParagraphOptions(),
      style: 'IntenseQuote',
    });
  },
  async details(state, node) {
    await state.renderContent(node);
  },
  async detailsSummary(state, node) {
    const prev = state.defaultRunOpts;
    state.defaultRunOpts = { ...headingRunOptions(4), ...prev };
    await state.renderInline(node);
    state.defaultRunOpts = prev;
    state.closeBlock(node, {
      heading: HeadingLevel.HEADING_4,
      ...headingParagraphOptions(),
    });
  },
  async detailsContent(state, node) {
    await state.renderContent(node);
  },
  async columns(state, node) {
    await state.renderContent(node);
  },
  async column(state, node) {
    await state.renderContent(node);
  },
  // Sync blocks: drop the chrome; export only tables inside the block.
  async transclusionSource(state, node) {
    for (const table of collectTables(node)) {
      // eslint-disable-next-line no-await-in-loop
      await state.table(table, tableExportOptions(table));
    }
  },
  mention(state, node) {
    state.text(`@${node.attrs?.label ?? ''}`);
  },
  status(state, node) {
    state.text(`[${node.attrs?.text ?? ''}]`);
  },
  pageBreak(state, node) {
    state.closeBlock(node, { pageBreakBefore: true });
  },
  footnoteReference(state, node) {
    const number =
      Number(node.attrs?.referenceNumber) || state.$footnoteCounter + 1;
    state.$footnoteCounter = Math.max(state.$footnoteCounter, number);
    // seed an empty body so the reference stays valid even if the trailing
    // footnotes list is missing; the footnotes node overwrites it with content
    if (!state.footnotes[number]) {
      state.footnotes[number] = { children: [new Paragraph('')] };
    }
    state.current.push(new FootnoteReferenceRun(number));
  },
  async footnotes(state, node) {
    for (let i = 0; i < node.childCount; i += 1) {
      const item = node.child(i);
      const number =
        Number(String(item.attrs?.id ?? '').replace('fn:', '')) || i + 1;
      await state.footnoteDefinition(item, number);
    }
  },
  // items are consumed by the footnotes handler above
  footnote() {},
  // No usable static export representation: skip without failing.
  subpages() {},
  transclusionReference() {},
  base() {},
};

export const defaultMarks: MarkSerializer = {
  bold() {
    return { bold: true };
  },
  italic() {
    return { italics: true };
  },
  strike() {
    return { strike: true };
  },
  underline() {
    return { underline: {} };
  },
  code() {
    return {
      font: { name: 'Monospace' },
      color: '000000',
      shading: { type: ShadingType.SOLID, color: 'D2D3D2', fill: 'D2D3D2' },
    };
  },
  superscript() {
    return { superScript: true };
  },
  subscript() {
    return { subScript: true };
  },
  link() {
    // Handled specifically in the serializer; Word treats links as nodes.
    return {};
  },
  highlight(_state, _node, mark) {
    const fill = toDocxColor(mark.attrs?.color);
    return fill
      ? { shading: { type: ShadingType.CLEAR, fill } }
      : { highlight: 'yellow' };
  },
  // @tiptap/extension-color stores the color on the textStyle mark.
  textStyle(_state, _node, mark) {
    const color = toDocxColor(mark.attrs?.color);
    return color ? { color } : {};
  },
  // Comments are editor-only; drop the annotation in the export.
  comment() {
    return {};
  },
};

function headingStyle(level: number) {
  const run = headingRunOptions(level);
  return {
    run,
    paragraph: {
      ...headingParagraphOptions(),
      keepNext: true,
      keepLines: true,
      outlineLevel: level - 1,
    },
  };
}

export async function pageNodeToDocxBuffer(
  doc: Node,
  getImageBuffer: DocxImageResolver,
): Promise<Buffer> {
  const serializer = new DocxSerializerAsync(defaultAsyncNodes, defaultMarks);
  const section = createExportSectionConfig();
  const wordDoc = await serializer.serializeAsync(
    doc,
    { getImageBuffer, sections: [section] },
    () =>
      ({
        styles: {
          default: {
            document: {
              run: bodyRunOptions(),
              paragraph: bodyParagraphOptions(),
            },
            heading1: headingStyle(1),
            heading2: headingStyle(2),
            heading3: headingStyle(3),
            heading4: headingStyle(4),
            heading5: headingStyle(5),
            heading6: headingStyle(6),
          },
          paragraphStyles: [7, 8, 9].map((level) => ({
            id: `Heading${level}`,
            name: `Heading ${level}`,
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            ...headingStyle(level),
          })),
        },
      }) as any,
  );
  return writeDocx(wordDoc);
}
