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

let pendingLoad: Promise<void> | null = null;

export function loadOnlyOfficeApi(documentServerUrl: string): Promise<void> {
  const src = `${documentServerUrl.replace(/\/+$/, "")}/web-apps/apps/api/documents/api.js`;

  if (window.DocsAPI?.DocEditor) {
    return Promise.resolve();
  }

  if (pendingLoad) {
    return pendingLoad;
  }

  pendingLoad = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.remove();
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = src;
    script.async = true;
    script.onload = () => {
      if (window.DocsAPI?.DocEditor) {
        resolve();
        return;
      }
      script.remove();
      reject(new Error("Failed to load OnlyOffice"));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Failed to load OnlyOffice"));
    };
    document.head.appendChild(script);
  }).finally(() => {
    pendingLoad = null;
  });

  return pendingLoad;
}
