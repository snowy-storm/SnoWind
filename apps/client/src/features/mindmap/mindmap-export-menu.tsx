import { Button, Menu } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { MindMapCanvasHandle } from "./mindmap-canvas";

type MindmapExportMenuProps = {
  canvasRef: React.RefObject<MindMapCanvasHandle | null>;
  fileName?: string;
};

export function MindmapExportMenu({
  canvasRef,
  fileName = "mindmap",
}: MindmapExportMenuProps) {
  const { t } = useTranslation();

  const exportAs = (type: string) => {
    canvasRef.current?.exportFile(type, fileName).catch(() => {});
  };

  return (
    <Menu shadow="md" width={180} position="bottom-end" withinPortal>
      <Menu.Target>
        <Button
          size="compact-sm"
          variant="default"
          leftSection={<IconDownload size={16} />}
        >
          {t("Export")}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => exportAs("png")}>PNG</Menu.Item>
        <Menu.Item onClick={() => exportAs("svg")}>SVG</Menu.Item>
        <Menu.Item onClick={() => exportAs("json")}>JSON</Menu.Item>
        <Menu.Item onClick={() => exportAs("smm")}>
          {t("Mind map file")}
        </Menu.Item>
        <Menu.Item onClick={() => exportAs("md")}>Markdown</Menu.Item>
        <Menu.Item onClick={() => exportAs("xmind")}>XMind</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
