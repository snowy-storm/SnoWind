type LibraryItems = any;

type LibraryPersistedData = {
  libraryItems: LibraryItems;
};

/** Shared export appState: light background + embed scene for re-edit. */
export const EXCALIDRAW_EXPORT_APP_STATE = {
  exportEmbedScene: true,
  exportWithDarkMode: false,
  exportBackground: true,
  viewBackgroundColor: "#ffffff",
  exportScale: 2,
} as const;

export const EXCALIDRAW_PNG_FILE_NAME = "diagram.excalidraw.png";

type ExcalidrawExportApi = {
  getSceneElements: () => readonly unknown[];
  getFiles: () => Record<string, unknown> | null;
};

/** Export the current scene to a PNG File with embedded scene data. */
export async function exportExcalidrawPngFile(
  api: ExcalidrawExportApi,
  fileName: string = EXCALIDRAW_PNG_FILE_NAME,
): Promise<File> {
  const { exportToBlob } = await import("@excalidraw/excalidraw");
  const blob = await exportToBlob({
    elements: api.getSceneElements() as any,
    appState: EXCALIDRAW_EXPORT_APP_STATE,
    files: api.getFiles() as any,
    mimeType: "image/png",
  });
  if (!blob?.size) {
    throw new Error("Excalidraw PNG export produced an empty blob");
  }
  return new File([blob], fileName, { type: "image/png" });
}

export interface LibraryPersistenceAdapter {
  load(metadata: { source: "load" | "save" }):
    | Promise<{ libraryItems: LibraryItems } | null>
    | {
        libraryItems: LibraryItems;
      }
    | null;

  save(libraryData: LibraryPersistedData): Promise<void> | void;
}

const LOCAL_STORAGE_KEY = "excalidrawLibrary";

export const localStorageLibraryAdapter: LibraryPersistenceAdapter = {
  async load() {
    try {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error("Error downloading Excalidraw library from localStorage", e);
    }
    return null;
  },
  async save(libraryData) {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(libraryData));
    } catch (e) {
      console.error(
        "Error while saving library from Excalidraw to localStorage",
        e,
      );
    }
  },
};
