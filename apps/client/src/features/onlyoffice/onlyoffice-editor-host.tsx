import { Modal } from "@mantine/core";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { onlyOfficeEditorAtom } from "./onlyoffice-atom";
import { OnlyOfficeEditor } from "./onlyoffice-editor";

export function OnlyOfficeEditorHost() {
  const { t } = useTranslation();
  const [request, setRequest] = useAtom(onlyOfficeEditorAtom);

  return (
    <Modal
      opened={!!request}
      onClose={() => setRequest(null)}
      title={request?.fileName || t("Open in OnlyOffice")}
      fullScreen
      padding={0}
      closeButtonProps={{ "aria-label": t("Close") }}
    >
      {request && (
        <div style={{ height: "calc(100vh - 60px)" }}>
          <OnlyOfficeEditor request={request} />
        </div>
      )}
    </Modal>
  );
}
