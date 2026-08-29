import { Group, Text } from "@mantine/core";
import React, { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TitleEditor } from "@/features/editor/title-editor";
import { DeletedPageBanner } from "@/features/page/trash/components/deleted-page-banner.tsx";
import { formattedDate } from "@/lib/time.ts";
import classes from "./file-page-header.module.css";

const MemoizedTitleEditor = React.memo(TitleEditor);

export type FilePagePerson = {
  name?: string | null;
} | null;

type FilePageHeaderProps = {
  title: string;
  pageId?: string;
  slugId?: string;
  spaceSlug?: string;
  editable?: boolean;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  creator?: FilePagePerson;
  lastUpdatedBy?: FilePagePerson;
  actions?: ReactNode;
  isBase?: boolean;
  drawingType?: string | null;
  createdLabel?: "uploaded" | "created";
  flush?: boolean;
};

export function FilePageHeader({
  title,
  pageId,
  slugId,
  spaceSlug,
  editable = false,
  createdAt,
  updatedAt,
  creator,
  lastUpdatedBy,
  actions,
  isBase,
  drawingType,
  createdLabel = "uploaded",
  flush = false,
}: FilePageHeaderProps) {
  const { t } = useTranslation();
  const showTitleEditor = Boolean(pageId && slugId);
  const creatorName = creator?.name?.trim() || t("Unknown");
  const editorName = lastUpdatedBy?.name?.trim() || creatorName;
  const createdAtLabel = createdAt ? formattedDate(new Date(createdAt)) : null;
  const editedAt = updatedAt ? formattedDate(new Date(updatedAt)) : null;
  const createdCopy =
    createdLabel === "created"
      ? "Created {{time}} by {{name}}"
      : "Uploaded {{time}} by {{name}}";

  return (
    <div className={flush ? `${classes.header} ${classes.flush}` : classes.header}>
      {slugId && <DeletedPageBanner slugId={slugId} />}
      <div className={classes.top}>
        <div className={classes.main}>
          <div className={classes.title}>
            {showTitleEditor ? (
              <MemoizedTitleEditor
                pageId={pageId}
                slugId={slugId}
                title={title}
                spaceSlug={spaceSlug ?? ""}
                editable={editable}
                compact
                isBase={isBase}
                drawingType={drawingType}
              />
            ) : (
              <div className={classes.fallbackTitle}>{title || t("Untitled")}</div>
            )}
          </div>
          {(createdAtLabel || editedAt) && (
            <div className={classes.meta}>
              {createdAtLabel && (
                <Text size="xs" c="dimmed">
                  {t(createdCopy, {
                    time: createdAtLabel,
                    name: creatorName,
                  })}
                </Text>
              )}
              {editedAt && (
                <Text size="xs" c="dimmed">
                  {t("Last edited {{time}} by {{name}}", {
                    time: editedAt,
                    name: editorName,
                  })}
                </Text>
              )}
            </div>
          )}
        </div>
        {actions ? (
          <Group gap={8} wrap="nowrap" className={classes.actions}>
            {actions}
          </Group>
        ) : null}
      </div>
    </div>
  );
}