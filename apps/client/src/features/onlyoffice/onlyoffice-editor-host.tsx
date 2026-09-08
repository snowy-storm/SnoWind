import { Modal } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { onlyOfficeEditorAtom } from "./onlyoffice-atom";
import { OnlyOfficeEditor, type OnlyOfficeEditorHandle } from "./onlyoffice-editor";

export function OnlyOfficeEditorHost() {
  const { t } = useTranslation();
  const [request, setRequest] = useAtom(onlyOfficeEditorAtom);
  const editorRef = useRef<OnlyOfficeEditorHandle>(null);
  const [saving, setSaving] = useState(false);

  const close = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await editorRef.current?.flush();
      setRequest(null);
    } catch {
      notifications.show({
        message: t("Failed to save document"),
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={!!request}
      onClose={() => void close()}
      title={request?.fileName || t("Open in OnlyOffice")}
      fullScreen
      padding={0}
      closeOnClickOutside={!saving}
      closeButtonProps={{ "aria-label": t("Close"), disabled: saving }}
    >
      {request && (
        <div style={{ height: "calc(100vh - 60px)" }}>
          <OnlyOfficeEditor ref={editorRef} request={request} />
        </div>
      )}
    </Modal>
  );
}
