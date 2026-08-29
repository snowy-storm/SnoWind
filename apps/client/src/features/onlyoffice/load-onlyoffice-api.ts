const SCRIPT_ID = "onlyoffice-api-js";

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (
        id: string,
        config: Record<string, unknown>,
      ) => { destroyEditor: () => void };
    };
  }
}

export function loadOnlyOfficeApi(documentServerUrl: string): Promise<void> {
  const src = `${documentServerUrl.replace(/\/+$/, "")}/web-apps/apps/api/documents/api.js`;

  if (window.DocsAPI?.DocEditor) {
    return Promise.resolve();
  }

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load OnlyOffice")), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load OnlyOffice"));
    document.head.appendChild(script);
  });
}
