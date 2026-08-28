import { DEFAULT_MINDMAP_TREE } from '@snowind/editor-ext';

export type DrawingType = 'excalidraw' | 'drawio' | 'mermaid' | 'mindmap';

export const DRAWING_TYPES: DrawingType[] = [
  'excalidraw',
  'drawio',
  'mermaid',
  'mindmap',
];

export const DEFAULT_MERMAID_SOURCE = 'flowchart LR\n    A --> B';

export function getEmptyDrawingContent(type: DrawingType) {
  if (type === 'mermaid') {
    return {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'mermaid' },
          content: [{ type: 'text', text: DEFAULT_MERMAID_SOURCE }],
        },
      ],
    };
  }

  if (type === 'mindmap') {
    return {
      type: 'doc',
      content: [
        {
          type: 'mindmap',
          attrs: { data: JSON.stringify(DEFAULT_MINDMAP_TREE) },
        },
      ],
    };
  }

  return {
    type: 'doc',
    content: [{ type }],
  };
}

export function isDrawingType(value: unknown): value is DrawingType {
  return (
    value === 'excalidraw' ||
    value === 'drawio' ||
    value === 'mermaid' ||
    value === 'mindmap'
  );
}
