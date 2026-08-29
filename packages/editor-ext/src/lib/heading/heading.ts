import TiptapHeading, {
  HeadingOptions as TiptapHeadingOptions,
} from "@tiptap/extension-heading";
import { Extension, mergeAttributes, textblockTypeInputRule } from "@tiptap/core";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Plugin, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { Node, NodeType } from "@tiptap/pm/model";
import { copyToClipboard } from "../utils";

export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type EditorHeadingLevel = (typeof HEADING_LEVELS)[number];

export const formatHeadingOutline = (parts: number[]): string => {
  if (parts.length <= 1) return `${parts[0] ?? 0}.`;
  return parts.join(".");
};

/**
 * Word-style multilevel labels: a heading's last component is its order
 * under the current parent, not its index among all same-level headings.
 * H1, H2, H2, H1, H2 → 1. / 1.1 / 1.2 / 2. / 2.1
 */
export const computeOutlineLabels = (levels: number[]): string[] => {
  const counters = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  return levels.map((raw) => {
    const level = Math.max(1, Math.min(9, Number(raw) || 1));
    counters[level - 1] += 1;
    for (let i = level; i < 9; i++) counters[i] = 0;
    return formatHeadingOutline(counters.slice(0, level));
  });
};

/** TipTap's Heading.levels is typed as 1–6; we store 7–9 as h6[data-level]. */
export interface EditorHeadingOptions
  extends Omit<TiptapHeadingOptions, "levels"> {
  levels: EditorHeadingLevel[];
}

export const headingTag = (level: number): string =>
  level <= 6 ? `h${level}` : "h6";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    headingLevel: {
      /**
       * Promote or demote selected headings, like Word's Multilevel List.
       * Tab increases the level (H1 → H2 → … → H9); Shift+Tab decreases it
       * (H9 → … → H1 → paragraph).
       */
      changeHeadingLevel: (delta: number) => ReturnType;
      /**
       * Set the selected heading(s) to a specific level without dropping
       * other attributes such as outline numbering.
       */
      setHeadingLevel: (level: EditorHeadingLevel) => ReturnType;
      /**
       * Toggle outline numbering (1 / 1.1 / 1.1.1) on selected headings.
       */
      toggleHeadingNumbered: () => ReturnType;
    };
  }
}

const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><!-- Icon from Material Symbols Light by Google - https://github.com/google/material-design-icons/blob/master/LICENSE --><path fill="currentColor" d="M10.616 16.077H7.077q-1.692 0-2.884-1.192T3 12t1.193-2.885t2.884-1.193h3.539v1H7.077q-1.27 0-2.173.904Q4 10.731 4 12t.904 2.173t2.173.904h3.539zM8.5 12.5v-1h7v1zm4.885 3.577v-1h3.538q1.27 0 2.173-.904Q20 13.269 20 12t-.904-2.173t-2.173-.904h-3.538v-1h3.538q1.692 0 2.885 1.192T21 12t-1.193 2.885t-2.884 1.193z"/></svg>`;
const successIcon = `<svg xmlns="http://www.w3.org/2000/svg" style="color: forestgreen;" width="18" height="18" viewBox="0 0 24 24"><!-- Icon from Material Symbols by Google - https://github.com/google/material-design-icons/blob/master/LICENSE --><path fill="currentColor" d="m10.6 16.6l7.05-7.05l-1.4-1.4l-5.65 5.65l-2.85-2.85l-1.4 1.4zM12 22q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12t.788-3.9t2.137-3.175T8.1 2.788T12 2t3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22"/></svg>`;

// Tab/Shift+Tab inside these ancestors already mean something else
// (cell navigation, list nesting, literal tab).
const BLOCKED_TAB_ANCESTORS = new Set([
  "listItem",
  "taskItem",
  "tableCell",
  "tableHeader",
  "codeBlock",
]);

const hasBlockedAncestor = (doc: EditorState["doc"], pos: number): boolean => {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth--) {
    if (BLOCKED_TAB_ANCESTORS.has($pos.node(depth).type.name)) {
      return true;
    }
  }
  return false;
};

const attrsForType = (
  node: Node,
  type: NodeType,
): Record<string, unknown> => {
  const attrs: Record<string, unknown> = {};
  const specAttrs = type.spec.attrs ?? {};
  for (const name of Object.keys(specAttrs)) {
    if (Object.prototype.hasOwnProperty.call(node.attrs, name)) {
      attrs[name] = node.attrs[name];
    }
  }
  return attrs;
};

const collectHeadings = (
  state: EditorState,
  opts?: { skipBlockedAncestors?: boolean },
): Array<{ node: Node; pos: number }> => {
  const { from, to } = state.selection;
  const found: Array<{ node: Node; pos: number }> = [];
  const skipBlocked = opts?.skipBlockedAncestors ?? true;

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "heading") return true;
    if (skipBlocked && hasBlockedAncestor(state.doc, pos)) return false;
    found.push({ node, pos });
    return false;
  });

  return found;
};

const applyHeadingNumberedToggle = (
  state: EditorState,
  tr: Transaction,
): boolean => {
  const headings = collectHeadings(state, { skipBlockedAncestors: false });
  if (!headings.length) return false;

  const next = !headings.every((item) => Boolean(item.node.attrs.numbered));
  for (const { node, pos } of headings) {
    if (Boolean(node.attrs.numbered) === next) continue;
    tr.setNodeMarkup(
      pos,
      undefined,
      { ...node.attrs, numbered: next },
      node.marks,
    );
  }
  return true;
};

const applyHeadingLevelDelta = (
  state: EditorState,
  tr: Transaction,
  levels: number[],
  delta: number,
): boolean => {
  const minLevel = Math.min(...levels);
  const maxLevel = Math.max(...levels);
  const paragraphType = state.schema.nodes.paragraph;
  let updated = false;

  for (const { node, pos } of collectHeadings(state)) {
    const current = Number(node.attrs.level) || minLevel;
    const next = current + delta;

    if (delta < 0 && current <= minLevel) {
      if (!paragraphType) continue;
      tr.setNodeMarkup(
        pos,
        paragraphType,
        attrsForType(node, paragraphType),
        node.marks,
      );
      updated = true;
      continue;
    }

    if (next < minLevel || next > maxLevel) continue;
    if (next === current) continue;

    tr.setNodeMarkup(
      pos,
      undefined,
      { ...node.attrs, level: next },
      node.marks,
    );
    updated = true;
  }

  return updated;
};

/**
 * Heading node stays at default priority so empty docs still default to
 * paragraph (`block+` uses the first matching node type). Tab/Enter
 * handling lives here at 1100 so it still wins over Indent (1000).
 */
const HeadingKeymap = Extension.create({
  name: "headingKeymap",
  priority: 1100,

  addKeyboardShortcuts() {
    const isInHeading = (): boolean => {
      if (!this.editor.isActive("heading")) return false;
      const { $from } = this.editor.state.selection;
      if ($from.depth === 0) return false;
      return !hasBlockedAncestor(
        this.editor.state.doc,
        $from.before($from.depth),
      );
    };

    return {
      Enter: () => {
        if (!this.editor.isActive("heading")) return false;
        const { $from, empty } = this.editor.state.selection;
        if ($from.parent.type.name !== "heading") return false;

        // Empty heading: just turn it into body text.
        if (empty && $from.parent.content.size === 0) {
          return this.editor.commands.setNode("paragraph");
        }

        // Enter at the start of a heading inserts a body paragraph above
        // so the heading (and its numbering) stay intact.
        if (empty && $from.parentOffset === 0) {
          const insertPos = $from.before($from.depth);
          return this.editor
            .chain()
            .insertContentAt(insertPos, { type: "paragraph" })
            .focus(insertPos + 1)
            .run();
        }

        const chain = this.editor.chain();
        if (!empty) chain.deleteSelection();
        return chain.splitBlock().setNode("paragraph").run();
      },
      Tab: () => {
        if (!isInHeading()) return false;
        return this.editor.commands.changeHeadingLevel(1);
      },
      "Shift-Tab": () => {
        if (!isInHeading()) return false;
        return this.editor.commands.changeHeadingLevel(-1);
      },
      Backspace: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!empty) return false;
        if ($from.parentOffset !== 0) return false;
        if (!isInHeading()) return false;
        return this.editor.commands.changeHeadingLevel(-1);
      },
    };
  },
});

export const Heading = TiptapHeading.extend<EditorHeadingOptions>({
  addExtensions() {
    return [HeadingKeymap];
  },

  addOptions() {
    return {
      // TipTap types Level as 1–6; runtime supports 1–9 via h6[data-level].
      levels: [...HEADING_LEVELS] as unknown as EditorHeadingOptions["levels"],
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      numbered: {
        default: false,
        keepOnSplit: true,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-numbered");
          return raw === "" || raw === "true";
        },
        renderHTML: (attributes) => {
          if (!attributes.numbered) return {};
          return { "data-numbered": "true" };
        },
      },
    };
  },

  parseHTML() {
    return [
      ...[7, 8, 9].map((level) => ({
        tag: `h6[data-level="${level}"]`,
        attrs: { level },
      })),
      ...this.options.levels
        .filter((level) => level <= 6)
        .map((level) => ({
          tag: `h${level}`,
          attrs: { level },
        })),
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const hasLevel = this.options.levels.includes(node.attrs.level);
    const level = hasLevel ? node.attrs.level : this.options.levels[0];
    const tag = headingTag(level);

    return [
      tag,
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        id: node.attrs.id,
        ...(level > 6 ? { "data-level": String(level) } : {}),
      }),
      0,
    ];
  },

  addInputRules() {
    return this.options.levels.map((level) =>
      textblockTypeInputRule({
        find: new RegExp(`^#{${level}}\\s$`),
        type: this.type,
        getAttributes: { level },
      }),
    );
  },

  addCommands() {
    return {
      ...this.parent?.(),
      changeHeadingLevel:
        (delta: number) =>
        ({ state, tr, dispatch }) => {
          if (!this.editor.isActive("heading")) return false;
          if (!applyHeadingLevelDelta(state, tr, this.options.levels, delta)) {
            return false;
          }
          if (dispatch) dispatch(tr);
          return true;
        },
      setHeadingLevel:
        (level: EditorHeadingLevel) =>
        ({ state, tr, dispatch, commands }) => {
          if (!(this.options.levels as number[]).includes(level)) return false;
          const headings = collectHeadings(state, {
            skipBlockedAncestors: false,
          });
          if (headings.length) {
            let updated = false;
            for (const { node, pos } of headings) {
              if (Number(node.attrs.level) === level) continue;
              tr.setNodeMarkup(
                pos,
                undefined,
                { ...node.attrs, level },
                node.marks,
              );
              updated = true;
            }
            if (updated && dispatch) dispatch(tr);
            return true;
          }
          return commands.setNode(this.name, { level });
        },
      toggleHeadingNumbered:
        () =>
        ({ state, tr, dispatch }) => {
          if (!this.editor.isActive("heading")) return false;
          if (!applyHeadingNumberedToggle(state, tr)) return false;
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },

  // @ts-ignore
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const { doc } = state;
            const headings: Array<{ node: Node; pos: number }> = [];

            doc.descendants((node, pos) => {
              if (node.type.name !== "heading") return true;
              headings.push({ node, pos });
              return false;
            });

            const labels = computeOutlineLabels(
              headings.map((item) => Number(item.node.attrs.level) || 1),
            );

            headings.forEach(({ node, pos }, index) => {
              if (node.attrs.numbered) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    "data-outline": labels[index],
                  }),
                );
              }

              if (node.content.size > 1) {
                const deco = Decoration.widget(
                  pos + node.nodeSize - 1,
                  () => {
                    const icon = document.createElement("span");
                    icon.classList.add("link-btn");
                    icon.innerHTML = "&nbsp;";
                    icon.contentEditable = "false";

                    const linkBtnContent = document.createElement("span");
                    linkBtnContent.classList.add("link-btn-content");
                    linkBtnContent.innerHTML = copyIcon;
                    icon.appendChild(linkBtnContent);

                    icon.addEventListener("mousedown", (e) =>
                      e.preventDefault(),
                    );
                    icon.addEventListener("click", (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const id = node.attrs.id;
                      const baseUrl = window.location.href.split('#')[0];
                      const url = `${baseUrl}#${id}`;
                      copyToClipboard(url);
                      linkBtnContent.innerHTML = successIcon;
                      setTimeout(
                        () => (linkBtnContent.innerHTML = copyIcon),
                        2000,
                      );
                    });

                    return icon;
                  },
                  { side: 1 }, // render after node content
                );
                decorations.push(deco);
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
