import {
  formatCharacterCount,
  formatFontSizePt,
  formatSpacingMeasure,
  headingOutlineNumberText,
  measureToTwip,
  parseCharacterCount,
  parseSpacingMeasure,
  parseWordExportStyle,
  presetBriefStyle,
  presetOfficialStyle,
  presetTechnicalStyle,
  standardWordExportStyle,
} from '../../../../../packages/editor-ext/src/lib/prosemirror-docx/word-export-style';

describe('word export style', () => {
  it('accepts the standard style', () => {
    const style = standardWordExportStyle();
    expect(style.bodyStyle.fontFamily).toBe('仿宋');
    const parsed = parseWordExportStyle(style);
    expect(parsed.ok).toBe(true);
  });

  it('keeps saved fonts and numbering templates that the form no longer edits', () => {
    const style = standardWordExportStyle();
    style.bodyStyle.fontFamily = '仿宋_GB2312';
    style.titleStyle[0].numberFormat = '{seq}';
    style.listStyle.orderedSymbol = '{seq}.';
    const parsed = parseWordExportStyle(style);
    expect(parsed.ok).toBe(true);
    if (parsed.ok === true) {
      expect(parsed.value.bodyStyle.fontFamily).toBe('仿宋_GB2312');
      expect(parsed.value.titleStyle[0].numberFormat).toBe('{seq}');
    }
  });

  it('formats Chinese type controls without changing the stored strings', () => {
    expect(formatFontSizePt(12)).toBe('12pt');
    expect(formatFontSizePt(10.5)).toBe('10.5pt');
    expect(parseCharacterCount('2字符')).toBe(2);
    expect(formatCharacterCount(2)).toBe('2字符');
    expect(parseSpacingMeasure('0.5行')).toEqual({ amount: 0.5, unit: '行' });
    expect(formatSpacingMeasure(12, 'pt')).toBe('12pt');
    expect(headingOutlineNumberText(1)).toBe('%1. ');
    expect(headingOutlineNumberText(2)).toBe('%1.%2 ');
    expect(headingOutlineNumberText(3)).toBe('%1.%2.%3 ');
  });

  it('rejects an image wider than the text area', () => {
    const style = standardWordExportStyle();
    style.imageStyle.maxWidth = '20cm';
    const parsed = parseWordExportStyle(style);
    expect(parsed.ok).toBe(false);
    if (parsed.ok === false) {
      expect(parsed.errors.some((issue) => issue.path === 'imageStyle.maxWidth')).toBe(true);
    }
  });

  it('builds the three presets', () => {
    expect(presetOfficialStyle().bodyStyle.lineSpacingVal).toBe('28pt');
    expect(presetTechnicalStyle().bodyStyle).toMatchObject({
      fontFamily: '宋体',
      lineSpacingType: 'multiple',
      lineSpacingVal: 1.5,
    });
    expect(presetBriefStyle().tableStyle.borderMode).toBe('fullLine');
    expect(presetBriefStyle().bodyStyle.lineSpacingVal).toBe('16pt');
  });

  it('converts centimetres to twips', () => {
    expect(measureToTwip('2.8cm', 12)).toBe(1587);
    expect(measureToTwip('12pt', 12)).toBe(240);
    expect(measureToTwip('2字符', 12)).toBe(480);
  });

  it('forces three-line tables to hide vertical borders', () => {
    const style = standardWordExportStyle();
    style.tableStyle.borderMode = 'threeLine';
    style.tableStyle.borderSideEnable = true;
    const parsed = parseWordExportStyle(style);
    expect(parsed.ok).toBe(true);
    if (parsed.ok === true) expect(parsed.value.tableStyle.borderSideEnable).toBe(false);
  });
});