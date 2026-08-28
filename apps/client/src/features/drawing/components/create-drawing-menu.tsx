import { Menu } from "@mantine/core";
import type { ReactNode } from "react";
import IconExcalidraw from "@/components/icons/icon-excalidraw";
import IconDrawio from "@/components/icons/icon-drawio";
import IconMermaid from "@/components/icons/icon-mermaid";
import type { DrawingType } from "@/features/page/types/page.types.ts";

type CreateDrawingMenuProps = {
  children: ReactNode;
  onSelect: (type: DrawingType) => void;
  position?: "bottom-end" | "right-start" | "bottom" | "right";
};

export function CreateDrawingMenu({
  children,
  onSelect,
  position = "right-start",
}: CreateDrawingMenuProps) {
  return (
    <Menu shadow="md" width={200} position={position} withArrow withinPortal>
      <Menu.Target>{children}</Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconExcalidraw size={16} />}
          onClick={() => onSelect("excalidraw")}
        >
          Excalidraw
        </Menu.Item>
        <Menu.Item
          leftSection={<IconDrawio size={16} />}
          onClick={() => onSelect("drawio")}
        >
          Draw.io
        </Menu.Item>
        <Menu.Item
          leftSection={<IconMermaid size={16} />}
          onClick={() => onSelect("mermaid")}
        >
          Mermaid
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
