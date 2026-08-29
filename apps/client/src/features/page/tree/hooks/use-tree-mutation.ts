import { useCallback } from "react";
import { useAtom, useStore } from "jotai";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { treeModel } from "@/features/page/tree/model/tree-model";
import type { DropOp } from "@/features/page/tree/model/tree-model.types";
import { dropOpToMovePayload } from "./drop-op-to-move-payload";
import { SpaceTreeNode } from "@/features/page/tree/types.ts";
import { IPage, type DrawingType } from "@/features/page/types/page.types.ts";
import {
  useCreatePageMutation,
  useRemovePageMutation,
  useMovePageMutation,
  useUpdatePageMutation,
  updateCacheOnMovePage,
} from "@/features/page/queries/page-query.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { getSpaceUrl } from "@/lib/config.ts";
import { useQueryEmit } from "@/features/websocket/use-query-emit.ts";
import { convertPageToBase } from "@/ee/base/services/base-service";
import { getPageById } from "@/features/page/services/page-service";
import { queryClient } from "@/main";
import { getApiErrorMessage } from "@/lib/api-error";
import type { IBase } from "@/ee/base/types/base.types";

export type CreatePageOptions = {
  isBase?: boolean;
  drawingType?: DrawingType;
};

export type UseTreeMutation = {
  handleMove: (sourceId: string, op: DropOp) => Promise<void>;
  handleCreate: (
    parentId: string | null,
    options?: CreatePageOptions,
  ) => Promise<void>;
  handleRename: (id: string, name: string) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
};

export function useTreeMutation(spaceId: string): UseTreeMutation {
  const { t } = useTranslation();
  const [, setData] = useAtom(treeDataAtom);
  // `store` reads the *current* treeDataAtom imperatively in handlers — avoids
  // stale-closure issues when the caller updates the tree (e.g. lazy-load
  // children) and then immediately invokes a handler.
  const store = useStore();
  const createPageMutation = useCreatePageMutation();
  const updatePageMutation = useUpdatePageMutation();
  const removePageMutation = useRemovePageMutation();
  const movePageMutation = useMovePageMutation();
  const navigate = useNavigate();
  const { spaceSlug, pageSlug } = useParams();
  const emit = useQueryEmit();

  const handleMove = useCallback(
    async (sourceId: string, op: DropOp) => {
      const before = store.get(treeDataAtom);
      const { tree: after, result } = treeModel.move(before, sourceId, op);
      if (after === before) return;

      const payload = dropOpToMovePayload(before, sourceId, op);
      const source = treeModel.find(before, sourceId) as SpaceTreeNode | null;
      if (!source) return;
      const oldParentId = source.parentPageId ?? null;

      // optimistic apply with the new position from the payload
      let optimistic = treeModel.update(after, sourceId, {
        position: payload.position,
        parentPageId: payload.parentPageId,
      } as Partial<SpaceTreeNode>);

      // If the old parent has no children left, mark hasChildren: false so the
      // chevron disappears. Without this, the empty parent keeps rendering an
      // expand toggle that fetches zero rows on click.
      if (oldParentId) {
        const oldParent = treeModel.find(optimistic, oldParentId);
        if (!oldParent?.children?.length) {
          optimistic = treeModel.update(optimistic, oldParentId, {
            hasChildren: false,
          } as Partial<SpaceTreeNode>);
        }
      }

      // For make-child onto a previously-childless target: flip hasChildren on
      // so the new parent shows its chevron.
      if (op.kind === "make-child") {
        optimistic = treeModel.update(optimistic, op.targetId, {
          hasChildren: true,
        } as Partial<SpaceTreeNode>);
      }

      setData(optimistic);

      try {
        await movePageMutation.mutateAsync(payload);
      } catch {
        setData(before);
        notifications.show({
          message: t("Failed to move page"),
          color: "red",
        });
        return;
      }

      const pageData: Partial<IPage> = {
        id: source.id,
        slugId: source.slugId,
        title: source.name,
        icon: source.icon,
        position: payload.position,
        spaceId: source.spaceId,
        parentPageId: payload.parentPageId,
        hasChildren: source.hasChildren,
      };

      updateCacheOnMovePage(
        spaceId,
        sourceId,
        oldParentId,
        payload.parentPageId,
        pageData,
      );

      setTimeout(() => {
        emit({
          operation: "moveTreeNode",
          spaceId: spaceId,
          payload: {
            id: sourceId,
            parentId: payload.parentPageId,
            oldParentId,
            index: result.index,
            position: payload.position,
            pageData,
          },
        });
      }, 50);
    },
    [setData, store, movePageMutation, spaceId, emit, t],
  );

  const handleCreate = useCallback(
    async (parentId: string | null, options?: CreatePageOptions) => {
      const payload: {
        spaceId: string;
        parentPageId?: string;
        isBase?: boolean;
        drawingType?: DrawingType;
      } = { spaceId };
      if (parentId) payload.parentPageId = parentId;
      if (options?.isBase) payload.isBase = true;
      if (options?.drawingType) payload.drawingType = options.drawingType;

      let createdPage: IPage;
      try {
        createdPage = await createPageMutation.mutateAsync(payload);
      } catch {
        throw new Error("Failed to create page");
      }

      if (options?.isBase) {
        try {
          const base = await convertPageToBase(createdPage.id);
          queryClient.setQueryData<IBase>(["bases", createdPage.id], base);
          const fullPage = await getPageById({ pageId: createdPage.id });
          createdPage = { ...fullPage, isBase: true };
          queryClient.setQueryData<IPage>(["pages", createdPage.id], createdPage);
          queryClient.setQueryData<IPage>(
            ["pages", createdPage.slugId],
            createdPage,
          );
        } catch (error) {
          notifications.show({
            message: getApiErrorMessage(error, t("Failed to create base")),
            color: "red",
          });
        }
      }

      const newNode: SpaceTreeNode = {
        id: createdPage.id,
        slugId: createdPage.slugId,
        name: "",
        position: createdPage.position,
        spaceId: createdPage.spaceId,
        parentPageId: createdPage.parentPageId,
        isBase: createdPage.isBase,
        drawingType: createdPage.drawingType,
        fileType: createdPage.fileType,
        hasChildren: false,
        children: [],
      };

      // Read latest tree at call time. Without this, callers that mutate the
      // tree (e.g. lazy-load children on expand) immediately before calling
      // handleCreate hit a stale closure and compute lastIndex against the
      // pre-load tree, requiring a setTimeout-based wait at the call site.
      const current = store.get(treeDataAtom);
      const existing = treeModel.find(current, createdPage.id) as
        | SpaceTreeNode
        | null;

      let lastIndex: number;
      if (existing) {
        // createPage already patched the sidebar query; space-tree may have
        // merged this node in while we were converting it to a base.
        lastIndex = treeModel.siblingsOf(current, createdPage.id)?.index ?? 0;
        if (createdPage.isBase && !existing.isBase) {
          setData((prev) =>
            treeModel.update(prev, createdPage.id, {
              isBase: true,
            } as Partial<SpaceTreeNode>),
          );
        }
      } else if (parentId === null) {
        lastIndex = current.length;
        setData((prev) => treeModel.insert(prev, parentId, newNode, lastIndex));
      } else {
        const parent = treeModel.find(current, parentId);
        lastIndex = parent?.children?.length ?? 0;
        setData((prev) => treeModel.insert(prev, parentId, newNode, lastIndex));
      }

      setTimeout(() => {
        emit({
          operation: "addTreeNode",
          spaceId,
          payload: {
            parentId,
            index: lastIndex,
            data: newNode,
          },
        });
      }, 50);

      const pageUrl = buildPageUrl(
        spaceSlug,
        createdPage.slugId,
        createdPage.title,
      );
      navigate(pageUrl);
    },
    [spaceId, createPageMutation, setData, store, emit, navigate, spaceSlug, t],
  );

  const handleRename = useCallback(
    async (id: string, name: string) => {
      setData((prev) =>
        treeModel.update(prev, id, { name } as Partial<SpaceTreeNode>),
      );
      try {
        await updatePageMutation.mutateAsync({ pageId: id, title: name });
      } catch (error) {
        console.error("Error updating page title:", error);
      }
    },
    [updatePageMutation, setData],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const node = treeModel.find(
        store.get(treeDataAtom),
        id,
      ) as SpaceTreeNode | null;
      const parentPageId = node?.parentPageId ?? null;
      try {
        await removePageMutation.mutateAsync(id);
        setData((prev) => {
          let next = treeModel.remove(prev, id);
          // If the parent has no children left, mark hasChildren: false so the
          // chevron disappears. Without this, the empty parent keeps rendering an
          // expand toggle that fetches zero rows on click.
          if (parentPageId) {
            const parent = treeModel.find(next, parentPageId);
            if (!parent?.children?.length) {
              next = treeModel.update(next, parentPageId, {
                hasChildren: false,
              } as Partial<SpaceTreeNode>);
            }
          }
          return next;
        });

        if (
          node &&
          pageSlug &&
          (node.slugId === pageSlug.split("-")[1] ||
            isPageInNode(node, pageSlug.split("-")[1]))
        ) {
          navigate(getSpaceUrl(spaceSlug));
        }

        setTimeout(() => {
          if (!node) return;
          emit({
            operation: "deleteTreeNode",
            spaceId,
            payload: { node },
          });
        }, 50);
      } catch (error) {
        console.error("Failed to delete page:", error);
      }
    },
    [removePageMutation, setData, store, pageSlug, navigate, spaceSlug, emit, spaceId],
  );

  return { handleMove, handleCreate, handleRename, handleDelete };
}

function isPageInNode(node: SpaceTreeNode, pageSlug: string): boolean {
  if (node.slugId === pageSlug) return true;
  if (!node.children) return false;
  for (const child of node.children) {
    if (isPageInNode(child, pageSlug)) return true;
  }
  return false;
}
