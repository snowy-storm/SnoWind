import { useEffect, useId, useRef, useState } from "react";
import { Center, Loader, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { fetchOnlyOfficeConfig } from "./onlyoffice-service";
import { loadOnlyOfficeApi } from "./load-onlyoffice-api";
import type { OnlyOfficeEditorRequest } from "./onlyoffice.utils";

type Props = {
  request: OnlyOfficeEditorRequest;
};

type OnlyOfficeFrameWindow = Window & {
  DE?: {
    getController?: (name: string) => {
      tryToShowLeftMenu?: () => void;
      leftMenu?: { showMenu?: (menu: string) => void };
    };
  };
};

function openBuiltInHeadings(placeholderId: string): boolean {
  const root = document.getElementById(placeholderId);
  const iframe = root?.querySelector("iframe");
  if (!iframe) return false;

  try {
    const frameWindow = iframe.contentWindow as OnlyOfficeFrameWindow | null;
    const leftMenu = frameWindow?.DE?.getController?.("LeftMenu");
    if (leftMenu?.leftMenu?.showMenu) {
      leftMenu.tryToShowLeftMenu?.();
      leftMenu.leftMenu.showMenu("navigation");
      return true;
    }
  } catch {
    // Cross-origin Document Server cannot be scripted from the app origin.
  }

  try {
    const button = iframe.contentDocument?.querySelector(
      "#left-btn-navigation",
    ) as HTMLElement | null;
    if (button) {
      button.click();
      return true;
    }
  } catch {
    // Same as above: iframe document is not readable cross-origin.
  }

  return false;
}

export function OnlyOfficeEditor({ request }: Props) {
  const { t } = useTranslation();
  const placeholderId = useId().replace(/:/g, "");
  const editorRef = useRef<{ destroyEditor: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    async function open() {
      setLoading(true);
      setError(null);
      try {
        const { documentServerUrl, config } = await fetchOnlyOfficeConfig({
          attachmentId: request.attachmentId,
          shareJwt: request.shareJwt,
          mode: request.mode,
        });
        await loadOnlyOfficeApi(documentServerUrl);
        if (cancelled) return;
        if (!window.DocsAPI?.DocEditor) {
          throw new Error("DocsAPI missing");
        }
        editorRef.current = new window.DocsAPI.DocEditor(placeholderId, {
          ...config,
          width: "100%",
          height: "100%",
          type: "desktop",
          events: {
            onDocumentReady: () => {
              if (cancelled || request.mode !== "view") return;
              let attempts = 0;
              const tryOpen = () => {
                if (cancelled) return;
                if (openBuiltInHeadings(placeholderId) || attempts >= 20) return;
                attempts += 1;
                retryTimer = setTimeout(tryOpen, 250);
              };
              tryOpen();
            },
          },
        });
      } catch {
        if (!cancelled) {
          setError(t("Failed to open office document"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    open();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      try {
        editorRef.current?.destroyEditor();
      } catch {
        // DocsAPI may throw if the iframe is already gone
      }
      editorRef.current = null;
    };
  }, [placeholderId, request.attachmentId, request.shareJwt, request.mode, t]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 480 }}>
      {loading && (
        <Center
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            background: "var(--mantine-color-body)",
          }}
        >
          <Loader />
        </Center>
      )}
      {error ? (
        <Center h="100%">
          <Text c="dimmed" size="sm">
            {error}
          </Text>
        </Center>
      ) : (
        <div id={placeholderId} style={{ width: "100%", height: "100%" }} />
      )}
    </div>
  );
}
