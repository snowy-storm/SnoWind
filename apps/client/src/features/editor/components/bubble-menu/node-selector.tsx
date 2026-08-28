import React, { Dispatch, FC, SetStateAction, useState } from "react";
import {
  IconBlockquote,
  IconCaretRightFilled,
  IconCheck,
  IconCheckbox,
  IconChevronDown,
  IconChevronRight,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconH4,
  IconH5,
  IconH6,
  IconHeading,
  IconInfoCircle,
  IconList,
  IconListNumbers,
  IconQuote,
  IconTypography,
} from "@tabler/icons-react";
import { Popover, Button, ScrollArea, Tooltip } from "@mantine/core";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { isEditorReady } from "@snowind/editor-ext";
import classes from "./bubble-menu.module.css";

interface NodeSelectorProps {
  editor: Editor | null;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}

export interface BubbleMenuItem {
  name: string;
  icon: React.ElementType;
  command: () => void;
  isActive: () => boolean;
  children?: BubbleMenuItem[];
}

export const NodeSelector: FC<NodeSelectorProps> = ({
  editor,
  isOpen,
  setIsOpen,
}) => {
  const { t } = useTranslation();

  const editorState = useEditorState({
    editor,
    selector: (ctx) => {
      if (!editor) {
        return null;
      }

      return {
        isParagraph: ctx.editor.isActive("paragraph"),
        isBulletList: ctx.editor.isActive("bulletList"),
        isOrderedList: ctx.editor.isActive("orderedList"),
        isHeading1: ctx.editor.isActive("heading", { level: 1 }),
        isHeading2: ctx.editor.isActive("heading", { level: 2 }),
        isHeading3: ctx.editor.isActive("heading", { level: 3 }),
        isHeading4: ctx.editor.isActive("heading", { level: 4 }),
        isHeading5: ctx.editor.isActive("heading", { level: 5 }),
        isHeading6: ctx.editor.isActive("heading", { level: 6 }),
        isHeading7: ctx.editor.isActive("heading", { level: 7 }),
        isHeading8: ctx.editor.isActive("heading", { level: 8 }),
        isHeading9: ctx.editor.isActive("heading", { level: 9 }),
        isHeading: ctx.editor.isActive("heading"),
        isHeadingNumbered: ctx.editor.isActive("heading", { numbered: true }),
        isTaskItem: ctx.editor.isActive("taskItem"),
        isBlockquote: ctx.editor.isActive("blockquote"),
        isCodeBlock: ctx.editor.isActive("codeBlock"),
        isCallout: ctx.editor.isActive("callout"),
        isDetails: ctx.editor.isActive("details"),
        isTransclusionSource: ctx.editor.isActive("transclusionSource"),
      };
    },
  });

  const items: BubbleMenuItem[] = [
    {
      name: "Text",
      icon: IconTypography,
      command: () =>
        editor.chain().focus().toggleNode("paragraph", "paragraph").run(),
      isActive: () =>
        editorState?.isParagraph &&
        !editorState?.isBulletList &&
        !editorState?.isOrderedList,
    },
    {
      name: "Heading 1",
      icon: IconH1,
      command: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: () => editorState?.isHeading1,
    },
    {
      name: "Heading 2",
      icon: IconH2,
      command: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: () => editorState?.isHeading2,
    },
    {
      name: "Heading 3",
      icon: IconH3,
      command: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: () => editorState?.isHeading3,
    },
    {
      name: "Heading N",
      icon: IconHeading,
      command: () => {},
      isActive: () =>
        Boolean(
          editorState?.isHeading4 ||
            editorState?.isHeading5 ||
            editorState?.isHeading6 ||
            editorState?.isHeading7 ||
            editorState?.isHeading8 ||
            editorState?.isHeading9,
        ),
      children: ([4, 5, 6, 7, 8, 9] as const).map((level) => ({
        name: `Heading ${level}`,
        icon: level === 4 ? IconH4 : level === 5 ? IconH5 : IconH6,
        command: () =>
          editor.chain().focus().setHeadingLevel(level).run(),
        isActive: () =>
          Boolean(
            editorState?.[
              `isHeading${level}` as
                | "isHeading4"
                | "isHeading5"
                | "isHeading6"
                | "isHeading7"
                | "isHeading8"
                | "isHeading9"
            ],
          ),
      })),
    },
    {
      name: "To-do List",
      icon: IconCheckbox,
      command: () => editor.chain().focus().toggleTaskList().run(),
      isActive: () => editorState?.isTaskItem,
    },
    {
      name: "Bullet List",
      icon: IconList,
      command: () => editor.chain().focus().toggleBulletList().run(),
      isActive: () => editorState?.isBulletList,
    },
    {
      name: "Numbered List",
      icon: IconListNumbers,
      command: () => {
        if (editor.isActive("heading")) {
          editor.chain().focus().toggleHeadingNumbered().run();
          return;
        }
        editor.chain().focus().toggleOrderedList().run();
      },
      isActive: () =>
        editor.isActive("heading")
          ? Boolean(editorState?.isHeadingNumbered)
          : Boolean(editorState?.isOrderedList),
    },
    {
      name: "Blockquote",
      icon: IconBlockquote,
      command: () =>
        editor
          .chain()
          .focus()
          .toggleNode("paragraph", "paragraph")
          .toggleBlockquote()
          .run(),
      isActive: () => editorState?.isBlockquote,
    },
    {
      name: "Synced block",
      icon: IconQuote,
      command: () => editor.chain().focus().toggleTransclusionSource().run(),
      isActive: () => editorState?.isTransclusionSource,
    },
    {
      name: "Code",
      icon: IconCode,
      command: () => editor.chain().focus().toggleCodeBlock().run(),
      isActive: () => editorState?.isCodeBlock,
    },
    {
      name: "Callout",
      icon: IconInfoCircle,
      command: () => editor.chain().focus().toggleCallout().run(),
      isActive: () => editorState?.isCallout,
    },
    {
      name: "Toggle block",
      icon: IconCaretRightFilled,
      command: () => editor.chain().focus().setDetails().run(),
      isActive: () => editorState?.isDetails,
    },
  ];

  const [expandedSubmenu, setExpandedSubmenu] = useState<string | null>(null);

  const leafItems = items.flatMap((item) =>
    item.children?.length ? item.children : [item],
  );
  const activeItem = leafItems.filter((item) => item.isActive()).pop() ?? {
    name: "Multiple",
  };

  const renderItem = (item: BubbleMenuItem, nested = false) => {
    const hasChildren = Boolean(item.children?.length);
    const expanded = expandedSubmenu === item.name;
    const childActive = item.children?.some((child) => child.isActive());

    return (
      <React.Fragment key={item.name}>
        <Button
          variant="default"
          leftSection={<item.icon size={16} />}
          rightSection={
            hasChildren ? (
              expanded ? (
                <IconChevronDown size={16} />
              ) : (
                <IconChevronRight size={16} />
              )
            ) : (
              activeItem.name === item.name && <IconCheck size={16} />
            )
          }
          justify="left"
          fullWidth
          onClick={() => {
            if (hasChildren) {
              setExpandedSubmenu(expanded ? null : item.name);
              return;
            }
            if (isEditorReady(editor)) item.command();
            setIsOpen(false);
          }}
          style={{ border: "none", paddingLeft: nested ? 28 : undefined }}
        >
          {t(item.name)}
          {hasChildren && childActive ? ` · ${t(activeItem.name)}` : null}
        </Button>
        {hasChildren &&
          expanded &&
          item.children.map((child) => renderItem(child, true))}
      </React.Fragment>
    );
  };

  return (
    <Popover
      opened={isOpen}
      onChange={(opened) => {
        setIsOpen(opened);
        if (!opened) setExpandedSubmenu(null);
      }}
      withArrow
    >
      <Popover.Target>
        <Tooltip
          label={t("Turn into")}
          withArrow
          withinPortal={false}
          disabled={isOpen}
        >
          <Button
            className={classes.buttonRoot}
            variant="default"
            style={{ border: "none", height: "34px" }}
            radius="0"
            rightSection={<IconChevronDown size={16} />}
            onClick={() => setIsOpen(!isOpen)}
            aria-label={t("Turn into")}
            aria-haspopup="menu"
            aria-expanded={isOpen}
          >
            {t(activeItem?.name)}
          </Button>
        </Tooltip>
      </Popover.Target>

      <Popover.Dropdown>
        <ScrollArea.Autosize type="scroll" mah={400}>
          <Button.Group orientation="vertical">
            {items.map((item) => renderItem(item))}
          </Button.Group>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
};
