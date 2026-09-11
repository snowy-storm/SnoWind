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
import {
  applyTextReplaceAll,
  applyTextReplaceAt,
  registerMermaidFindBridge,
} from "@/features/page-find/mermaid-find-bridge";
import { findTextMatches } from "@/features/page-find/utils/text-matches";

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
  const sourceRef = useRef(source);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  sourceRef.current = source;

  const persist = useDebouncedCallback((next: string) => {
    persistDrawing("mermaid", {}, next).catch(() => {});
  }, 800);

  const applySource = useCallback(
    (next: string) => {
      setSource(next);
      if (editable) persist(next);
    },
    [editable, persist],
  );

  useEffect(() => {
    registerMermaidFindBridge({
      getSource: () => sourceRef.current,
      selectRange: (start, end) => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(start, end);
      },
      replaceCurrent: (index, needle, replacement, caseSensitive) => {
        if (!editable) return 0;
        const { next, nextIndex, count } = applyTextReplaceAt(
          sourceRef.current,
          index,
          needle,
          replacement,
          caseSensitive,
        );
        if (count === 0) return 0;
        applySource(next);
        const matches = findTextMatches(next, needle, caseSensitive);
        if (matches[nextIndex]) {
          const match = matches[nextIndex];
          requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(match.start, match.end);
          });
        }
        return count;
      },
      replaceAll: (needle, replacement, caseSensitive) => {
        if (!editable) return 0;
        const { next, count } = applyTextReplaceAll(
          sourceRef.current,
          needle,
          replacement,
          caseSensitive,
        );
        if (count === 0) return 0;
        applySource(next);
        return count;
      },
    });
    return () => {
      registerMermaidFindBridge(null);
    };
  }, [applySource, editable]);

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
          ref={textareaRef}
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
