import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { maxTopLevelTableWidth } from "@snowind/editor-ext";

export const PAGE_COLUMN_WIDTH = 900;

function editorPaddingX(editor: Editor): number {
  try {
    const cs = getComputedStyle(editor.view.dom);
    return (
      (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
    );
  } catch {
    return 96;
  }
}

/**
 * Default page column is 900px, centered. When a top-level table is
 * wider than the content box, the column grows to fit that table
 * (plus editor padding). Mantine Container is `width: 100%` with
 * `max-width`, so an open/resized right aside shrinks `<main>` and
 * caps the column automatically.
 */
export function usePageColumnWidth(
  editor: Editor | null,
  enabled: boolean,
): number {
  const [width, setWidth] = useState(PAGE_COLUMN_WIDTH);

  useEffect(() => {
    if (!enabled) {
      setWidth(PAGE_COLUMN_WIDTH);
      return;
    }

    const compute = () => {
      if (!editor || editor.isDestroyed) {
        setWidth(PAGE_COLUMN_WIDTH);
        return;
      }
      const tableW = maxTopLevelTableWidth(editor.state.doc);
      setWidth(
        Math.max(PAGE_COLUMN_WIDTH, Math.round(tableW + editorPaddingX(editor))),
      );
    };

    compute();
    if (!editor) return;

    editor.on("create", compute);
    editor.on("update", compute);
    return () => {
      editor.off("create", compute);
      editor.off("update", compute);
    };
  }, [editor, enabled]);

  return width;
}
