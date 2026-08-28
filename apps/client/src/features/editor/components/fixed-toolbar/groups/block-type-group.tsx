import { FC } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { Button, Menu } from "@mantine/core";
import {
  IconBlockquote,
  IconBraces,
  IconChevronDown,
  IconH1,
  IconH2,
  IconH3,
  IconH4,
  IconH5,
  IconH6,
  IconHeading,
  IconMenu4,
  IconPageBreak,
  IconTypography,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

interface Props {
  editor: Editor;
}

export const BlockTypeGroup: FC<Props> = ({ editor }) => {
  const { t } = useTranslation();

  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      isHeading1: !!ctx.editor?.isActive("heading", { level: 1 }),
      isHeading2: !!ctx.editor?.isActive("heading", { level: 2 }),
      isHeading3: !!ctx.editor?.isActive("heading", { level: 3 }),
      isHeading4: !!ctx.editor?.isActive("heading", { level: 4 }),
      isHeading5: !!ctx.editor?.isActive("heading", { level: 5 }),
      isHeading6: !!ctx.editor?.isActive("heading", { level: 6 }),
      isHeading7: !!ctx.editor?.isActive("heading", { level: 7 }),
      isHeading8: !!ctx.editor?.isActive("heading", { level: 8 }),
      isHeading9: !!ctx.editor?.isActive("heading", { level: 9 }),
      isBlockquote: !!ctx.editor?.isActive("blockquote"),
      isCodeBlock: !!ctx.editor?.isActive("codeBlock"),
    }),
  });

  let label = t("Normal text");
  if (state.isHeading1) label = t("Heading 1");
  else if (state.isHeading2) label = t("Heading 2");
  else if (state.isHeading3) label = t("Heading 3");
  else if (state.isHeading4) label = t("Heading 4");
  else if (state.isHeading5) label = t("Heading 5");
  else if (state.isHeading6) label = t("Heading 6");
  else if (state.isHeading7) label = t("Heading 7");
  else if (state.isHeading8) label = t("Heading 8");
  else if (state.isHeading9) label = t("Heading 9");
  else if (state.isBlockquote) label = t("Quote");
  else if (state.isCodeBlock) label = t("Code block");

  return (
    <Menu shadow="md" position="bottom-start" withArrow={false}>
      <Menu.Target>
        <Button
          variant="subtle"
          color="dark"
          size="xs"
          rightSection={<IconChevronDown size={14} />}
        >
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconTypography size={16} />}
          onClick={() =>
            editor.chain().focus().toggleNode("paragraph", "paragraph").run()
          }
        >
          {t("Text")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconH1 size={16} />}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          {t("Heading 1")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconH2 size={16} />}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          {t("Heading 2")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconH3 size={16} />}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          {t("Heading 3")}
        </Menu.Item>
        <Menu.Sub position="right-start">
          <Menu.Sub.Target>
            <Menu.Sub.Item leftSection={<IconHeading size={16} />}>
              {t("Heading N")}
            </Menu.Sub.Item>
          </Menu.Sub.Target>
          <Menu.Sub.Dropdown>
            {([4, 5, 6, 7, 8, 9] as const).map((level) => (
              <Menu.Item
                key={level}
                leftSection={
                  level === 4 ? (
                    <IconH4 size={16} />
                  ) : level === 5 ? (
                    <IconH5 size={16} />
                  ) : (
                    <IconH6 size={16} />
                  )
                }
                onClick={() =>
                  editor.chain().focus().setHeadingLevel(level).run()
                }
              >
                {t(`Heading ${level}`)}
              </Menu.Item>
            ))}
          </Menu.Sub.Dropdown>
        </Menu.Sub>
        <Menu.Item
          leftSection={<IconBlockquote size={16} />}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          {t("Quote")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconBraces size={16} />}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          {t("Code block")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconMenu4 size={16} />}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          {t("Divider")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconPageBreak size={16} />}
          onClick={() => editor.chain().focus().setPageBreak().run()}
        >
          {t("Page break")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
