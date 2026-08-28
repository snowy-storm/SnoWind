import { ThemeIcon } from "@mantine/core";
import { IconFileDescription, IconTable } from "@tabler/icons-react";
import IconExcalidraw from "@/components/icons/icon-excalidraw";
import IconDrawio from "@/components/icons/icon-drawio";
import IconMermaid from "@/components/icons/icon-mermaid";
import IconMindmap from "@/components/icons/icon-mindmap";
import type { DrawingType } from "@/features/page/types/page.types.ts";

type Props = {
  icon?: string | null;
  isBase?: boolean;
  drawingType?: DrawingType | string | null;
  size?: number;
};

export function PageKindIcon({
  isBase,
  drawingType,
  size = 18,
}: Omit<Props, "icon">) {
  const color = "var(--mantine-color-dimmed)";
  if (isBase) return <IconTable size={size} color={color} />;
  if (drawingType === "excalidraw")
    return <IconExcalidraw size={size} color={color} />;
  if (drawingType === "drawio") return <IconDrawio size={size} color={color} />;
  if (drawingType === "mermaid")
    return <IconMermaid size={size} color={color} />;
  if (drawingType === "mindmap")
    return <IconMindmap size={size} color={color} />;
  return <IconFileDescription size={size} color={color} />;
}

export function PageListIcon({ icon, isBase, drawingType, size = 18 }: Props) {
  if (icon) {
    return <>{icon}</>;
  }
  return (
    <ThemeIcon variant="transparent" color="gray" size={size}>
      <PageKindIcon isBase={isBase} drawingType={drawingType} size={size} />
    </ThemeIcon>
  );
}
