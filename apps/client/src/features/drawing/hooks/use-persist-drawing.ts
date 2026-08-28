import { useCallback } from "react";
import { useUpdatePageMutation } from "@/features/page/queries/page-query.ts";
import type { DrawingType } from "@/features/page/types/page.types.ts";
import { buildDrawingContent } from "@/features/drawing/drawing-content.ts";

export function usePersistDrawing(pageId: string) {
  const updatePageMutation = useUpdatePageMutation();

  return useCallback(
    async (
      type: DrawingType,
      attrs: Record<string, unknown> = {},
      mermaidSource?: string,
    ) => {
      await updatePageMutation.mutateAsync({
        pageId,
        content: buildDrawingContent(type, attrs, mermaidSource),
        format: "json",
        operation: "replace",
      });
    },
    [pageId, updatePageMutation],
  );
}
