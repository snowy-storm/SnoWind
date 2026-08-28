import { useComputedColorScheme } from "@mantine/core";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import {
  loadMindMapConstructor,
  parseMindmapData,
  serializeMindmapData,
  type MindMapInstance,
} from "./mindmap-lib";

export type MindMapCanvasHandle = {
  getData: () => string;
  exportFile: (
    type: string,
    fileName?: string,
    download?: boolean,
  ) => Promise<string>;
  setLayout: (layout: string) => void;
  getLayout: () => string;
};

type MindMapCanvasProps = {
  initialData?: unknown;
  editable?: boolean;
  onChange?: () => void;
};

export const MindMapCanvas = forwardRef<MindMapCanvasHandle, MindMapCanvasProps>(
  function MindMapCanvas({ initialData, editable = true, onChange }, ref) {
    const { t } = useTranslation();
    const colorScheme = useComputedColorScheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const instanceRef = useRef<MindMapInstance | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useImperativeHandle(ref, () => ({
      getData: () => {
        if (!instanceRef.current) {
          return typeof initialData === "string"
            ? initialData
            : JSON.stringify(parseMindmapData(initialData).tree);
        }
        return serializeMindmapData(instanceRef.current);
      },
      exportFile: async (type: string, fileName = "mindmap", download = true) => {
        if (!instanceRef.current) {
          throw new Error("Mind map is not ready");
        }
        const result = await instanceRef.current.export(type, download, fileName);
        if (!result) {
          throw new Error("Mind map export failed");
        }
        return result;
      },
      setLayout: (layout: string) => {
        instanceRef.current?.setLayout(layout);
        onChangeRef.current?.();
      },
      getLayout: () => instanceRef.current?.opt?.layout || "logicalStructure",
    }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      let cancelled = false;
      let resizeObserver: ResizeObserver | null = null;
      const parsed = parseMindmapData(initialData);

      (async () => {
        const MindMap = await loadMindMapConstructor();
        if (cancelled || !containerRef.current) return;

        const container = containerRef.current;
        if (container.clientWidth === 0 || container.clientHeight === 0) {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
          });
        }
        if (cancelled || !containerRef.current) return;

        const mindMap = new MindMap({
          el: containerRef.current,
          data: parsed.tree,
          layout: parsed.layout || "logicalStructure",
          readonly: !editable,
          mousewheelAction: "zoom",
          defaultInsertSecondLevelNodeText: t("Topic"),
          defaultInsertBelowSecondLevelNodeText: t("Subtopic"),
          themeConfig: {
            backgroundColor: colorScheme === "dark" ? "#25262b" : "#fafafa",
          },
        }) as MindMapInstance;

        const handleChange = () => onChangeRef.current?.();
        mindMap.on("data_change", handleChange);

        instanceRef.current = mindMap;

        resizeObserver = new ResizeObserver(() => {
          mindMap.resize();
        });
        resizeObserver.observe(containerRef.current);
      })();

      return () => {
        cancelled = true;
        resizeObserver?.disconnect();
        instanceRef.current?.destroy();
        instanceRef.current = null;
      };
      // Recreate only when editability changes; content is owned by the instance.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editable]);

    useEffect(() => {
      instanceRef.current?.setThemeConfig(
        {
          backgroundColor: colorScheme === "dark" ? "#25262b" : "#fafafa",
        },
        false,
      );
    }, [colorScheme]);

    return (
      <div
        ref={containerRef}
        className="mindmap-canvas"
        style={{ width: "100%", height: "100%", minHeight: 320 }}
      />
    );
  },
);
