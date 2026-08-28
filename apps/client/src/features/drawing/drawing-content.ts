import { DEFAULT_MINDMAP_TREE } from "@snowind/editor-ext";

export type DrawingType = "excalidraw" | "drawio" | "mermaid" | "mindmap";

export const DEFAULT_MERMAID_SOURCE = "flowchart LR\n    A --> B";

export function getEmptyDrawingContent(type: DrawingType) {
  if (type === "mermaid") {
    return {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [{ type: "text", text: DEFAULT_MERMAID_SOURCE }],
        },
      ],
    };
  }

  if (type === "mindmap") {
    return {
      type: "doc",
      content: [
        {
          type: "mindmap",
          attrs: { data: JSON.stringify(DEFAULT_MINDMAP_TREE) },
        },
      ],
    };
  }

  return {
    type: "doc",
    content: [{ type }],
  };
}

export function getDrawingAttrs(content: unknown, type: DrawingType) {
  const nodes = (content as { content?: any[] })?.content ?? [];
  if (type === "mermaid") {
    return (
      nodes.find(
        (node) =>
          node?.type === "codeBlock" && node?.attrs?.language === "mermaid",
      )?.attrs ?? {}
    );
  }
  return nodes.find((node) => node?.type === type)?.attrs ?? {};
}

export function getMermaidSource(content: unknown): string {
  const nodes = (content as { content?: any[] })?.content ?? [];
  const node = nodes.find(
    (item) =>
      item?.type === "codeBlock" && item?.attrs?.language === "mermaid",
  );
  const texts = node?.content ?? [];
  const source = texts.map((item: { text?: string }) => item.text ?? "").join("");
  return source || DEFAULT_MERMAID_SOURCE;
}

export function buildDrawingContent(
  type: DrawingType,
  attrs: Record<string, unknown> = {},
  mermaidSource?: string,
) {
  if (type === "mermaid") {
    return {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [
            {
              type: "text",
              text: mermaidSource || DEFAULT_MERMAID_SOURCE,
            },
          ],
        },
      ],
    };
  }

  return {
    type: "doc",
    content: [{ type, attrs }],
  };
}
