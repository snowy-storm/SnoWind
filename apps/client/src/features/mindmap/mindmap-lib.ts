import { DEFAULT_MINDMAP_TREE } from "@snowind/editor-ext";

export type MindMapInstance = {
  destroy: () => void;
  resize: () => void;
  getData: (withConfig?: boolean) => unknown;
  setThemeConfig: (config: Record<string, unknown>, notRender?: boolean) => void;
  setLayout: (layout: string, notRender?: boolean) => void;
  export: (
    type: string,
    isDownload?: boolean,
    fileName?: string,
    ...args: unknown[]
  ) => Promise<string>;
  on: (event: string, fn: (...args: unknown[]) => void) => void;
  off: (event: string, fn: (...args: unknown[]) => void) => void;
  opt: { layout?: string };
};

export type ParsedMindmap = {
  tree: typeof DEFAULT_MINDMAP_TREE;
  layout?: string;
  full?: Record<string, unknown> | null;
};

let pluginsRegistered = false;

export async function loadMindMapConstructor() {
  const MindMap = (await import("simple-mind-map")).default;
  if (!pluginsRegistered) {
    const [
      { default: Export },
      { default: ExportXMind },
      { default: Drag },
      { default: Select },
      { default: KeyboardNavigation },
    ] = await Promise.all([
      import("simple-mind-map/src/plugins/Export.js"),
      import("simple-mind-map/src/plugins/ExportXMind.js"),
      import("simple-mind-map/src/plugins/Drag.js"),
      import("simple-mind-map/src/plugins/Select.js"),
      import("simple-mind-map/src/plugins/KeyboardNavigation.js"),
    ]);
    MindMap.usePlugin(Export)
      .usePlugin(ExportXMind)
      .usePlugin(Drag)
      .usePlugin(Select)
      .usePlugin(KeyboardNavigation);
    pluginsRegistered = true;
  }
  return MindMap;
}

export function parseMindmapData(raw: unknown): ParsedMindmap {
  if (!raw) {
    return { tree: DEFAULT_MINDMAP_TREE, layout: "logicalStructure", full: null };
  }
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed?.root?.data) {
      return {
        tree: parsed.root,
        layout: parsed.layout || "logicalStructure",
        full: parsed,
      };
    }
    if (parsed?.data) {
      return {
        tree: parsed,
        layout: "logicalStructure",
        full: null,
      };
    }
  } catch {
    /* ignore malformed payloads */
  }
  return { tree: DEFAULT_MINDMAP_TREE, layout: "logicalStructure", full: null };
}

export function serializeMindmapData(mindMap: MindMapInstance): string {
  return JSON.stringify(mindMap.getData(true));
}

export function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [header, payload] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "application/octet-stream";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mime });
}

export function exportResultToSvgString(result: string): string {
  if (result.startsWith("data:image/svg+xml;base64,")) {
    const base64 = result.slice("data:image/svg+xml;base64,".length);
    return new TextDecoder().decode(
      Uint8Array.from(atob(base64), (char) => char.codePointAt(0) ?? 0),
    );
  }
  if (result.startsWith("data:image/svg+xml;charset=utf-8,")) {
    return decodeURIComponent(
      result.slice("data:image/svg+xml;charset=utf-8,".length),
    );
  }
  if (result.startsWith("data:image/svg+xml,")) {
    return decodeURIComponent(result.slice("data:image/svg+xml,".length));
  }
  return result;
}

export const MINDMAP_LAYOUTS = [
  { value: "logicalStructure", label: "Logical structure" },
  { value: "mindMap", label: "Mind map" },
  { value: "organizationStructure", label: "Organization" },
  { value: "catalogOrganization", label: "Catalog" },
  { value: "timeline", label: "Timeline" },
  { value: "fishbone", label: "Fishbone" },
] as const;
