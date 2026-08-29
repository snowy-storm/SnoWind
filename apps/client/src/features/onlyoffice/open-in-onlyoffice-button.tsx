import { ActionIcon, Tooltip } from "@mantine/core";
import { IconFileSpreadsheet } from "@tabler/icons-react";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { isOnlyOfficeEnabled } from "@/lib/config.ts";
import { onlyOfficeEditorAtom } from "./onlyoffice-atom";
import {
  getShareAttachmentJwt,
  isOnlyOfficeFile,
} from "./onlyoffice.utils";

type Props = {
  attachmentId?: string | null;
  fileName?: string;
  mimeType?: string;
  url?: string;
  variant?: "default" | "subtle";
};

export function OpenInOnlyOfficeButton({
  attachmentId,
  fileName,
  mimeType,
  url,
  variant = "default",
}: Props) {
  const { t } = useTranslation();
  const setRequest = useSetAtom(onlyOfficeEditorAtom);

  if (!isOnlyOfficeEnabled() || !attachmentId) {
    return null;
  }
  if (!isOnlyOfficeFile(fileName, mimeType)) {
    return null;
  }

  return (
    <Tooltip label={t("Open in OnlyOffice")} position="top" withinPortal={false}>
      <ActionIcon
        variant={variant}
        color={variant === "subtle" ? "gray" : undefined}
        aria-label={t("Open in OnlyOffice")}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setRequest({
            attachmentId,
            fileName,
            shareJwt: getShareAttachmentJwt(url),
          });
        }}
      >
        <IconFileSpreadsheet size={18} />
      </ActionIcon>
    </Tooltip>
  );
}
