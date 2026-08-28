import { AlignmentType, convertInchesToTwip, ILevelsOptions, LevelFormat } from 'docx';
import { INumbering } from './types';

function basicIndentStyle(indent: number): Pick<ILevelsOptions, 'style' | 'alignment'> {
  return {
    alignment: AlignmentType.START,
    style: {
      paragraph: {
        indent: { left: convertInchesToTwip(indent), hanging: convertInchesToTwip(0.18) },
      },
    },
  };
}

const numbered = Array(3)
  .fill([LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN])
  .flat()
  .map((format, level) => ({
    level,
    format,
    text: `%${level + 1}.`,
    ...basicIndentStyle((level + 1) / 2),
  }));

const bullets = Array(3)
  .fill(['●', '○', '■'])
  .flat()
  .map((text, level) => ({
    level,
    format: LevelFormat.BULLET,
    text,
    ...basicIndentStyle((level + 1) / 2),
  }));

// Word Multilevel List linked to Heading 1–6: 1 / 1.1 / 1.1.1 …
const headingOutline = Array.from({ length: 9 }, (_, level) => {
  const text = Array.from({ length: level + 1 }, (_unused, i) => `%${i + 1}`).join('.');
  return {
    level,
    format: LevelFormat.DECIMAL,
    text,
    alignment: AlignmentType.START,
    style: {
      paragraph: {
        indent: {
          left: convertInchesToTwip(level * 0.25),
          hanging: convertInchesToTwip(0.3),
        },
      },
    },
  };
});

const styles = {
  numbered,
  bullets,
};

export type NumberingStyles = keyof typeof styles;

export const HEADING_OUTLINE_REFERENCE = 'heading-outline';

export function createNumbering(reference: string, style: NumberingStyles): INumbering {
  return {
    reference,
    levels: styles[style],
  };
}

export function createHeadingNumbering(
  reference: string = HEADING_OUTLINE_REFERENCE,
): INumbering {
  return {
    reference,
    levels: headingOutline,
  };
}
