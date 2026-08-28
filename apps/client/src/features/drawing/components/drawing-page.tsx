import React from "react";
import { TitleEditor } from "@/features/editor/title-editor";
import { DeletedPageBanner } from "@/features/page/trash/components/deleted-page-banner.tsx";
import type { DrawingType } from "@/features/page/types/page.types.ts";
import { DrawingExcalidraw } from "./drawing-excalidraw";
import { DrawingDrawio } from "./drawing-drawio";
import { DrawingMermaid } from "./drawing-mermaid";
import { DrawingMindmap } from "./drawing-mindmap";

const MemoizedTitleEditor = React.memo(TitleEditor);

type DrawingPageProps = {
  pageId: string;
  slugId: string;
  title: string;
  spaceSlug: string;
  content: unknown;
  drawingType: DrawingType;
  editable: boolean;
};

export function DrawingPage({
  pageId,
  slugId,
  title,
  spaceSlug,
  content,
  drawingType,
  editable,
}: DrawingPageProps) {
  return (
    <div
      className="drawing-page-root"
      style={{
        display: "flex",
        flexDirection: "column",
        paddingTop: "calc(var(--page-header-height) + 6px)",
      }}
    >
      <div style={{ paddingInline: 24, paddingBottom: 6 }}>
        <DeletedPageBanner slugId={slugId} />
        <div className="drawing-page-title">
          <MemoizedTitleEditor
            pageId={pageId}
            slugId={slugId}
            title={title}
            spaceSlug={spaceSlug}
            editable={editable}
            drawingType={drawingType}
          />
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {drawingType === "excalidraw" && (
          <DrawingExcalidraw
            pageId={pageId}
            content={content}
            editable={editable}
          />
        )}
        {drawingType === "drawio" && (
          <DrawingDrawio pageId={pageId} content={content} editable={editable} />
        )}
        {drawingType === "mermaid" && (
          <DrawingMermaid
            pageId={pageId}
            content={content}
            editable={editable}
          />
        )}
        {drawingType === "mindmap" && (
          <DrawingMindmap
            pageId={pageId}
            content={content}
            editable={editable}
          />
        )}
      </div>
    </div>
  );
}
