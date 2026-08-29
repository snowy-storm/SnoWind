import { getSchema } from '@tiptap/core';
import {
  htmlToJson,
  jsonToHtml,
  tiptapExtensions,
} from '../../../collaboration/collaboration.util';
import { computeOutlineLabels, htmlToMarkdown } from '@snowind/editor-ext';

const findFirstChild = (
  json: any,
  type: string,
): any | undefined => {
  if (!json || typeof json !== 'object') return undefined;
  if (json.type === type) return json;
  if (Array.isArray(json.content)) {
    for (const child of json.content) {
      const found = findFirstChild(child, type);
      if (found) return found;
    }
  }
  return undefined;
};

const findHeadings = (json: any, acc: any[] = []): any[] => {
  if (!json || typeof json !== 'object') return acc;
  if (json.type === 'heading') acc.push(json);
  if (Array.isArray(json.content)) {
    for (const child of json.content) findHeadings(child, acc);
  }
  return acc;
};

const headingHtml = (level: number, text: string) =>
  level <= 6
    ? `<h${level}>${text}</h${level}>`
    : `<h6 data-level="${level}">${text}</h6>`;

describe('heading levels 1–9', () => {
  it('defaults an empty document to a paragraph, not heading 1', () => {
    const schema = getSchema(tiptapExtensions);
    expect(schema.topNodeType.contentMatch.defaultType?.name).toBe(
      'paragraph',
    );
    expect(schema.topNodeType.createAndFill()?.firstChild?.type.name).toBe(
      'paragraph',
    );
  });

  it.each([1, 2, 3, 4, 5, 6] as const)(
    'parses and re-serializes h%i',
    (level) => {
      const html = headingHtml(level, `Heading ${level}`);
      const json = htmlToJson(html);
      const heading = findFirstChild(json, 'heading');
      expect(heading).toBeDefined();
      expect(heading.attrs.level).toBe(level);
      const out = jsonToHtml(json);
      expect(out).toContain(`<h${level}`);
      expect(out).toContain(`Heading ${level}`);
    },
  );

  it.each([7, 8, 9] as const)(
    'parses and re-serializes heading level %i as h6[data-level]',
    (level) => {
      const html = headingHtml(level, `Heading ${level}`);
      const json = htmlToJson(html);
      const heading = findFirstChild(json, 'heading');
      expect(heading).toBeDefined();
      expect(heading.attrs.level).toBe(level);
      const out = jsonToHtml(json);
      expect(out).toContain('data-level');
      expect(out).toContain(`Heading ${level}`);
    },
  );

  it('round-trips a stack of nine heading levels through HTML', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      .map((level) => headingHtml(level, `H${level}`))
      .join('');
    const json = htmlToJson(original);
    const headings = findHeadings(json);
    expect(headings.map((h) => h.attrs.level)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('exports heading levels 1–6 as ATX markdown', () => {
    const json = htmlToJson(
      [1, 2, 3, 4, 5, 6]
        .map((level) => headingHtml(level, `H${level}`))
        .join(''),
    );
    const markdown = htmlToMarkdown(jsonToHtml(json));
    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(markdown).toContain(`${'#'.repeat(level)} H${level}`);
    }
  });

  it('round-trips data-numbered on a heading', () => {
    const html = '<h2 data-numbered="true">Numbered</h2>';
    const json = htmlToJson(html);
    const heading = findFirstChild(json, 'heading');
    expect(heading.attrs.numbered).toBe(true);
    expect(jsonToHtml(json)).toContain('data-numbered');
  });

  it('omits data-numbered when numbering is off', () => {
    const html = '<h2>Plain</h2>';
    const json = htmlToJson(html);
    expect(findFirstChild(json, 'heading').attrs.numbered).toBe(false);
    expect(jsonToHtml(json)).not.toContain('data-numbered');
  });

  it('restarts lower-level outline numbers under each parent heading', () => {
    expect(computeOutlineLabels([1, 2, 2, 1, 2])).toEqual([
      '1.',
      '1.1',
      '1.2',
      '2.',
      '2.1',
    ]);
    expect(computeOutlineLabels([1, 2, 3, 2, 3, 1, 2, 3])).toEqual([
      '1.',
      '1.1',
      '1.1.1',
      '1.2',
      '1.2.1',
      '2.',
      '2.1',
      '2.1.1',
    ]);
    expect(computeOutlineLabels([1, 3, 1, 3])).toEqual([
      '1.',
      '1.0.1',
      '2.',
      '2.0.1',
    ]);
  });
});
