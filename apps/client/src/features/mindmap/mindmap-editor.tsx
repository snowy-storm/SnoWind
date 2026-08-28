import { Group, Select, Text } from "@mantine/core";
import type { ReactNode, RefObject } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MindMapCanvas, type MindMapCanvasHandle } from "./mindmap-canvas";
import { MINDMAP_LAYOUTS, parseMindmapData } from "./mindmap-lib";

type MindmapEditorProps = {
  canvasRef: RefObject<MindMapCanvasHandle | null>;
  initialData?: unknown;
  onChange?: () => void;
  actions?: ReactNode;
};

export function MindmapEditor({
  canvasRef,
  initialData,
  onChange,
  actions,
}: MindmapEditorProps) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState(
    () => parseMindmapData(initialData).layout || "logicalStructure",
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <Group justify="space-between" wrap="nowrap" px="xs" py={6} gap="xs">
        <Group gap="xs">
          <Select
            size="xs"
            w={180}
            value={layout}
            onChange={(value) => {
              if (!value) return;
              setLayout(value);
              canvasRef.current?.setLayout(value);
            }}
            data={MINDMAP_LAYOUTS.map((item) => ({
              value: item.value,
              label: t(item.label),
            }))}
            aria-label={t("Layout")}
          />
          <Text size="xs" c="dimmed">
            {t("Tab: child node. Enter: sibling node.")}
          </Text>
        </Group>
        <Group gap="xs">{actions}</Group>
      </Group>
      <div style={{ flex: 1, minHeight: 0 }}>
        <MindMapCanvas
          ref={canvasRef}
          initialData={initialData}
          editable
          onChange={onChange}
        />
      </div>
    </div>
  );
}
