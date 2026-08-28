import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export const DEFAULT_MINDMAP_TREE = {
  data: { text: "Central Topic", expand: true },
  children: [
    { data: { text: "Topic 1", expand: true }, children: [] },
    { data: { text: "Topic 2", expand: true }, children: [] },
    { data: { text: "Topic 3", expand: true }, children: [] },
  ],
};

export function extractMindmapPlainText(raw: unknown): string {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw || "null") : raw;
    const root = parsed?.root ?? parsed;
    const texts: string[] = [];
    const walk = (node: { data?: { text?: string }; children?: unknown[] }) => {
      if (!node) return;
      const text = node.data?.text;
      if (typeof text === "string" && text) {
        texts.push(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      }
      (node.children || []).forEach((child) => walk(child as typeof node));
    };
    walk(root);
    return texts.filter(Boolean).join(" ");
  } catch {
    return "";
  }
}

export interface MindmapOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface MindmapAttributes {
  src?: string;
  title?: string;
  alt?: string;
  size?: number;
  width?: number | string;
  height?: number;
  aspectRatio?: number;
  align?: string;
  attachmentId?: string;
  data?: string;
}

export type MindmapStorage = {
  autoOpen: boolean;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mindmap: {
      setMindmap: (attributes?: MindmapAttributes) => ReturnType;
      setMindmapAlign: (align: "left" | "center" | "right") => ReturnType;
      setMindmapSize: (width: number, height: number) => ReturnType;
    };
  }

  interface Storage {
    mindmap: MindmapStorage;
  }
}

export const Mindmap = Node.create<MindmapOptions, MindmapStorage>({
  name: "mindmap",
  inline: false,
  group: "block",
  isolating: true,
  atom: true,
  defining: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      view: null,
    };
  },

  addStorage() {
    return {
      autoOpen: false,
    };
  },

  addAttributes() {
    return {
      src: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-src"),
        renderHTML: (attributes) => ({
          "data-src": attributes.src,
        }),
      },
      title: {
        default: undefined,
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes: MindmapAttributes) => ({
          "data-title": attributes.title,
        }),
      },
      alt: {
        default: undefined,
        parseHTML: (element) => element.getAttribute("data-alt"),
        renderHTML: (attributes: MindmapAttributes) => ({
          "data-alt": attributes.alt,
        }),
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-width");
          if (!raw) return null;
          if (raw.endsWith("%")) return raw;
          const num = parseFloat(raw);
          return isNaN(num) ? null : num;
        },
        renderHTML: (attributes: MindmapAttributes) => ({
          "data-width": attributes.width,
        }),
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-height");
          if (!raw) return null;
          const num = parseFloat(raw);
          return isNaN(num) ? null : num;
        },
        renderHTML: (attributes: MindmapAttributes) => ({
          "data-height": attributes.height,
        }),
      },
      size: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-size"),
        renderHTML: (attributes: MindmapAttributes) => ({
          "data-size": attributes.size,
        }),
      },
      aspectRatio: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-aspect-ratio"),
        renderHTML: (attributes: MindmapAttributes) => ({
          "data-aspect-ratio": attributes.aspectRatio,
        }),
      },
      align: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-align"),
        renderHTML: (attributes: MindmapAttributes) => ({
          "data-align": attributes.align,
        }),
      },
      attachmentId: {
        default: undefined,
        parseHTML: (element) => element.getAttribute("data-attachment-id"),
        renderHTML: (attributes: MindmapAttributes) => ({
          "data-attachment-id": attributes.attachmentId,
        }),
      },
      data: {
        default: JSON.stringify(DEFAULT_MINDMAP_TREE),
        parseHTML: (element) => element.getAttribute("data-mindmap"),
        renderHTML: (attributes: MindmapAttributes) => ({
          "data-mindmap": attributes.data,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[data-type="${this.name}"]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-type": this.name },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
      [
        "img",
        {
          src: HTMLAttributes["data-src"],
          alt: HTMLAttributes["data-alt"] || HTMLAttributes["data-title"],
          width: HTMLAttributes["data-width"],
        },
      ],
    ];
  },

  renderText({ node }) {
    return extractMindmapPlainText(node.attrs.data);
  },

  addCommands() {
    return {
      setMindmap:
        (attrs?: MindmapAttributes) =>
        ({ commands }) => {
          this.storage.autoOpen = !attrs?.src;
          return commands.insertContent({
            type: "mindmap",
            attrs: attrs,
          });
        },

      setMindmapAlign:
        (align) =>
        ({ commands }) =>
          commands.updateAttributes("mindmap", { align }),

      setMindmapSize:
        (width, height) =>
        ({ commands }) =>
          commands.updateAttributes("mindmap", { width, height }),
    };
  },

  addNodeView() {
    this.editor.isInitialized = true;
    return ReactNodeViewRenderer(this.options.view);
  },
});
