import type { UrlParameters } from "react-drawio";

export const DRAWIO_EDITOR_CONFIGURATION = {
  defaultPageVisible: false,
};

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
