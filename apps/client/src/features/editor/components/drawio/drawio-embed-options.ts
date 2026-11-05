import type { UrlParameters } from "react-drawio";

export const DRAWIO_EDITOR_CONFIGURATION = {
  defaultPageVisible: false,
};

/**
 * Export as PNG with embedded diagram XML so Word embeds a raster image
 * directly, while Draw.io can still reload the diagram for editing.
 */
export const DRAWIO_EXPORT_OPTIONS = {
  format: "xmlpng" as const,
  scale: 2,
  background: "#ffffff",
  transparent: false,
  keepTheme: false,
};

export const DRAWIO_PNG_FILE_NAME = "diagram.drawio.png";

export function getDrawioUrlParameters(
  colorScheme: string,
  saveAndExit: boolean,
): UrlParameters {
  return {
    ui: colorScheme === "light" ? "kennedy" : "dark",
    spin: true,
    libraries: true,
    saveAndExit,
    noSaveBtn: true,
    // Draw.io URL param: pv=0 disables page view by default.
    pv: false,
  } as UrlParameters;
}
