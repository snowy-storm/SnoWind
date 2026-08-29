import { Button, Group, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconFileText } from "@tabler/icons-react";
import { useAtom, useStore } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "@/lib/api-error";
import { convertWordPageToSystemPage } from "@/features/page/services/page-service";
import {
  invalidateOnCreatePage,
  invalidateOnDeletePage,
} from "@/features/page/queries/page-query";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom";
import { treeModel } from "@/features/page/tree/model/tree-model";
import type { SpaceTreeNode } from "@/features/page/tree/types";
import { buildPageUrl } from "@/features/page/page.utils";
import { useQueryEmit } from "@/features/websocket/use-query-emit";
import { queryClient } from "@/main";
import type { IPage } from "@/features/page/types/page.types";

type ConvertWordToPageButtonProps = {
  pageId: string;
  spaceId: string;
  spaceSlug: string;
  fileName: string;
  disabled?: boolean;
};

export function ConvertWordToPageButton({
  pageId,
  spaceId,
  spaceSlug,
  fileName,
  disabled = false,
}: ConvertWordToPageButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const emit = useQueryEmit();
  const store = useStore();
  const [, setTreeData] = useAtom(treeDataAtom);
  const [converting, setConverting] = useState(false);

  const applyTreeUpdate = (created: IPage, deletedOriginal: boolean) => {
    const newNode: SpaceTreeNode = {
      id: created.id,
      slugId: created.slugId,
      name: created.title || "",
      position: created.position,
      spaceId: created.spaceId,
      parentPageId: created.parentPageId ?? "",
      isBase: created.isBase,
      drawingType: created.drawingType,
      fileType: created.fileType,
      hasChildren: false,
      children: [],
    };

    const current = store.get(treeDataAtom);
    const siblings = treeModel.siblingsOf(current, pageId);
    const parentId = deletedOriginal
      ? (siblings?.parentId ?? created.parentPageId ?? null)
      : pageId;
    const index = deletedOriginal
      ? (siblings?.index ?? 0) + 1
      : (treeModel.find(current, pageId)?.children?.length ?? 0);

    setTreeData((prev) => {
      let next = treeModel.insert(prev, parentId, newNode, index);
      if (!deletedOriginal) {
        next = treeModel.update(next, pageId, {
          hasChildren: true,
        } as Partial<SpaceTreeNode>);
      } else {
        const wordParentId = siblings?.parentId ?? null;
        next = treeModel.remove(next, pageId);
        if (wordParentId) {
          const parent = treeModel.find(next, wordParentId);
          if (!parent?.children?.length) {
            next = treeModel.update(next, wordParentId, {
              hasChildren: false,
            } as Partial<SpaceTreeNode>);
          }
        }
      }
      return next;
    });

    setTimeout(() => {
      emit({
        operation: "addTreeNode",
        spaceId,
        payload: {
          parentId,
          index,
          data: newNode,
        },
      });
      if (deletedOriginal) {
        const wordNode = treeModel.find(current, pageId) as SpaceTreeNode | null;
        if (wordNode) {
          emit({
            operation: "deleteTreeNode",
            spaceId,
            payload: { node: wordNode },
          });
        }
      }
    }, 50);
  };

  const runConvert = async (keepOriginal: boolean) => {
    modals.closeAll();
    setConverting(true);
    try {
      const result = await convertWordPageToSystemPage(pageId, keepOriginal);
      invalidateOnCreatePage(result.page);
      queryClient.setQueryData(["pages", result.page.id], result.page);
      queryClient.setQueryData(["pages", result.page.slugId], result.page);
      if (result.deletedOriginal) {
        invalidateOnDeletePage(pageId);
      }
      applyTreeUpdate(result.page, result.deletedOriginal);
      navigate(buildPageUrl(spaceSlug, result.page.slugId, result.page.title));
    } catch (error) {
      notifications.show({
        message: getApiErrorMessage(
          error,
          t("Failed to convert Word document"),
        ),
        color: "red",
      });
    } finally {
      setConverting(false);
    }
  };

  const openConfirm = () => {
    modals.open({
      title: t("Convert to system document"),
      centered: true,
      children: (
        <>
          <Text size="sm">
            {t(
              "{{title}} will be converted to a system page document. Changes will be saved in the new system document page. Keep the original file?",
              { title: fileName },
            )}
          </Text>
          <Group justify="flex-end" mt="md" gap="sm">
            <Button variant="default" onClick={() => modals.closeAll()}>
              {t("Cancel")}
            </Button>
            <Button
              color="red"
              variant="light"
              onClick={() => void runConvert(false)}
            >
              {t("Delete")}
            </Button>
            <Button onClick={() => void runConvert(true)}>{t("Keep")}</Button>
          </Group>
        </>
      ),
    });
  };

  return (
    <Button
      variant="default"
      size="compact-sm"
      leftSection={<IconFileText size={16} />}
      onClick={openConfirm}
      disabled={disabled}
      loading={converting}
    >
      {t("Convert to system document")}
    </Button>
  );
}
