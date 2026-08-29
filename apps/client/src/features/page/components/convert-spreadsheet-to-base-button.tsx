import {
  Button,
  Checkbox,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconTable } from "@tabler/icons-react";
import { useAtom, useStore } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  convertSpreadsheetPageToBases,
  listSpreadsheetPageSheets,
} from "@/ee/base/services/base-service";
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

type ConvertSpreadsheetToBaseButtonProps = {
  pageId: string;
  spaceId: string;
  spaceSlug: string;
  fileName: string;
  disabled?: boolean;
};

export function ConvertSpreadsheetToBaseButton({
  pageId,
  spaceId,
  spaceSlug,
  fileName,
  disabled = false,
}: ConvertSpreadsheetToBaseButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const emit = useQueryEmit();
  const store = useStore();
  const [, setTreeData] = useAtom(treeDataAtom);
  const [converting, setConverting] = useState(false);

  const applyTreeUpdate = (createdPages: IPage[], deletedOriginal: boolean) => {
    const current = store.get(treeDataAtom);
    const siblings = treeModel.siblingsOf(current, pageId);
    const parentId = deletedOriginal
      ? (siblings?.parentId ?? createdPages[0]?.parentPageId ?? null)
      : pageId;
    let index = deletedOriginal
      ? (siblings?.index ?? 0) + 1
      : (treeModel.find(current, pageId)?.children?.length ?? 0);

    setTreeData((prev) => {
      let next = prev;
      for (const created of createdPages) {
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
        next = treeModel.insert(next, parentId, newNode, index);
        index += 1;
      }
      if (!deletedOriginal) {
        next = treeModel.update(next, pageId, {
          hasChildren: true,
        } as Partial<SpaceTreeNode>);
      } else {
        const sheetParentId = siblings?.parentId ?? null;
        next = treeModel.remove(next, pageId);
        if (sheetParentId) {
          const parent = treeModel.find(next, sheetParentId);
          if (!parent?.children?.length) {
            next = treeModel.update(next, sheetParentId, {
              hasChildren: false,
            } as Partial<SpaceTreeNode>);
          }
        }
      }
      return next;
    });

    let emitIndex = deletedOriginal
      ? (siblings?.index ?? 0) + 1
      : (treeModel.find(current, pageId)?.children?.length ?? 0);

    setTimeout(() => {
      for (const created of createdPages) {
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
        emit({
          operation: "addTreeNode",
          spaceId,
          payload: {
            parentId,
            index: emitIndex,
            data: newNode,
          },
        });
        emitIndex += 1;
      }
      if (deletedOriginal) {
        const sheetNode = treeModel.find(current, pageId) as SpaceTreeNode | null;
        if (sheetNode) {
          emit({
            operation: "deleteTreeNode",
            spaceId,
            payload: { node: sheetNode },
          });
        }
      }
    }, 50);
  };

  const runConvert = async (sheetNames: string[], keepOriginal: boolean) => {
    modals.closeAll();
    setConverting(true);
    try {
      const result = await convertSpreadsheetPageToBases(
        pageId,
        sheetNames,
        keepOriginal,
      );
      for (const page of result.pages) {
        invalidateOnCreatePage(page);
        queryClient.removeQueries({ queryKey: ["pages", page.id] });
        queryClient.removeQueries({ queryKey: ["pages", page.slugId] });
      }
      if (result.deletedOriginal) {
        invalidateOnDeletePage(pageId);
      }
      applyTreeUpdate(result.pages, result.deletedOriginal);
      const first = result.pages[0];
      if (first) {
        navigate(buildPageUrl(spaceSlug, first.slugId, first.title));
      }
    } catch (error) {
      notifications.show({
        message: getApiErrorMessage(
          error,
          t("Failed to convert spreadsheet"),
        ),
        color: "red",
      });
    } finally {
      setConverting(false);
    }
  };

  const openConfirm = () => {
    modals.open({
      title: t("Convert to base table"),
      centered: true,
      children: (
        <ConvertSpreadsheetModalBody
          pageId={pageId}
          fileName={fileName}
          converting={converting}
          onConvert={(sheetNames, keepOriginal) =>
            void runConvert(sheetNames, keepOriginal)
          }
        />
      ),
    });
  };

  return (
    <Button
      variant="default"
      size="compact-sm"
      leftSection={<IconTable size={16} />}
      onClick={openConfirm}
      disabled={disabled}
      loading={converting}
    >
      {t("Convert to base table")}
    </Button>
  );
}

function ConvertSpreadsheetModalBody({
  pageId,
  fileName,
  converting,
  onConvert,
}: {
  pageId: string;
  fileName: string;
  converting: boolean;
  onConvert: (sheetNames: string[], keepOriginal: boolean) => void;
}) {
  const { t } = useTranslation();
  const [sheets, setSheets] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listSpreadsheetPageSheets(pageId)
      .then((result) => {
        if (cancelled) return;
        const names = result.sheets ?? [];
        setSheets(names);
        setSelected(names);
        if (!names.length) {
          setError(t("No sheets found in this file."));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          getApiErrorMessage(err, t("Failed to read spreadsheet")),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, t]);

  const allSelected = sheets.length > 0 && selected.length === sheets.length;
  const canSubmit = selected.length > 0 && !loading && !error;

  return (
    <Stack gap="md">
      {loading ? (
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      ) : error ? (
        <Text size="sm" c="red">
          {error}
        </Text>
      ) : (
        <>
          <Text size="sm" c="dimmed">
            {t(
              "Select which sheets to convert to base tables. Each sheet becomes a base page titled with the sheet name.",
            )}
          </Text>
          <Checkbox
            label={t("Select all")}
            checked={allSelected}
            indeterminate={selected.length > 0 && !allSelected}
            onChange={() => setSelected(allSelected ? [] : [...sheets])}
          />
          <ScrollArea.Autosize mah={220} type="auto">
            <Checkbox.Group value={selected} onChange={setSelected}>
              <Stack gap="xs">
                {sheets.map((name) => (
                  <Checkbox key={name} value={name} label={name} />
                ))}
              </Stack>
            </Checkbox.Group>
          </ScrollArea.Autosize>
        </>
      )}
      <Text size="sm">
        {t(
          "{{title}} will be converted to system base tables. Changes will be saved in the new system document pages. Keep the original file?",
          { title: fileName },
        )}
      </Text>
      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={() => modals.closeAll()}>
          {t("Cancel")}
        </Button>
        <Button
          color="red"
          variant="light"
          disabled={!canSubmit}
          loading={converting}
          onClick={() => onConvert(selected, false)}
        >
          {t("Delete")}
        </Button>
        <Button
          disabled={!canSubmit}
          loading={converting}
          onClick={() => onConvert(selected, true)}
        >
          {t("Keep")}
        </Button>
      </Group>
    </Stack>
  );
}
