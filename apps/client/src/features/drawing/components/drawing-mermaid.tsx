import { Button, Group, Textarea, useComputedColorScheme } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconDownload } from "@tabler/icons-react";
import mermaid from "mermaid";
import { v4 as uuidv4 } from "uuid";
import DOMPurify from "dompurify";
import { useDebouncedCallback } from "@mantine/hooks";
import { usePersistDrawing } from "@/features/drawing/hooks/use-persist-drawing.ts";
import {
  DEFAULT_MERMAID_SOURCE,
  getMermaidSource,
} from "@/features/drawing/drawing-content.ts";

type DrawingMermaidProps = {
  pageId: string;
  content: unknown;
  editable: boolean;
};

export function DrawingMermaid({
  pageId,
  content,
  editable,
}: DrawingMermaidProps) {
  const { t } = useTranslation();
  const persistDrawing = usePersistDrawing(pageId);
  const computedColorScheme = useComputedColorScheme();
  const [source, setSource] = useState(
    () => getMermaidSource(content) || DEFAULT_MERMAID_SOURCE,
  );
  const [preview, setPreview] = useState("");
  const svgRef = useRef("");

  const persist = useDebouncedCallback((next: string) => {
    persistDrawing("mermaid", {}, next).catch(() => {});
  }, 800);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      suppressErrorRendering: true,
      theme: computedColorScheme === "light" ? "default" : "dark",
    });
  }, [computedColorScheme]);

  useEffect(() => {
    const id = `mermaid-page-${uuidv4()}`;
    if (!source.trim()) {
      setPreview("");
      svgRef.current = "";
      return;
    }
    mermaid
      .render(id, source)
      .then((item) => {
        svgRef.current = item.svg;
        setPreview(item.svg);
      })
      .catch((err) => {
        svgRef.current = "";
        setPreview(
          `<div style="color: var(--mantine-color-red-6); padding: 12px;">${t("Mermaid diagram error:")} ${DOMPurify.sanitize(String(err))}</div>`,
        );
      });
  }, [source, computedColorScheme, t]);

  const handleChange = (value: string) => {
    setSource(value);
    if (editable) persist(value);
  };

  const handleDownload = useCallback(() => {
    if (!svgRef.current) return;
    const blob = new Blob([svgRef.current], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagram.mermaid.svg";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <Group justify="flex-end" wrap="nowrap" px="xs" py={6}>
        <Button
          size="compact-sm"
          variant="default"
          leftSection={<IconDownload size={16} />}
          onClick={handleDownload}
          disabled={!preview || preview.startsWith("<div")}
        >
          {t("Download")}
        </Button>
      </Group>
      <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            padding: "0 12px 12px",
          }}
          className="drawing-mermaid-split"
      >
        <Textarea
          value={source}
          onChange={(event) => handleChange(event.currentTarget.value)}
          readOnly={!editable}
          autosize={false}
          styles={{
            root: { height: "100%", display: "flex", flexDirection: "column" },
            wrapper: { flex: 1, minHeight: 0 },
            input: {
              height: "100%",
              fontFamily: "var(--mantine-font-family-monospace)",
              fontSize: 13,
            },
          }}
          aria-label="Mermaid"
        />
        <div
          style={{
            overflow: "auto",
            border: "1px solid var(--mantine-color-default-border)",
            borderRadius: 8,
            padding: 16,
            background: "var(--mantine-color-body)",
          }}
          dangerouslySetInnerHTML={{ __html: preview }}
        />
      </div>
    </div>
  );
}
