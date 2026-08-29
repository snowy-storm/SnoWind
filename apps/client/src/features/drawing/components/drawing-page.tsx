import {
  FilePageHeader,
  type FilePagePerson,
} from "@/features/page/components/file-page-header";
import type { DrawingType } from "@/features/page/types/page.types.ts";
import { DrawingExcalidraw } from "./drawing-excalidraw";
import { DrawingDrawio } from "./drawing-drawio";
import { DrawingMermaid } from "./drawing-mermaid";
import { DrawingMindmap } from "./drawing-mindmap";

type DrawingPageProps = {
  pageId: string;
  slugId: string;
  title: string;
  spaceSlug: string;
  content: unknown;
  drawingType: DrawingType;
  editable: boolean;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  creator?: FilePagePerson;
  lastUpdatedBy?: FilePagePerson;
};

export function DrawingPage({
  pageId,
  slugId,
  title,
  spaceSlug,
  content,
  drawingType,
  editable,
  createdAt,
  updatedAt,
  creator,
  lastUpdatedBy,
}: DrawingPageProps) {
  return (
    <div
      className="drawing-page-root"
      style={{
        display: "flex",
        flexDirection: "column",
        paddingTop: "var(--page-header-height)",
      }}
    >
      <FilePageHeader
        title={title}
        pageId={pageId}
        slugId={slugId}
        spaceSlug={spaceSlug}
        editable={editable}
        createdAt={createdAt}
        updatedAt={updatedAt}
        creator={creator}
        lastUpdatedBy={lastUpdatedBy}
        drawingType={drawingType}
        createdLabel="created"
      />
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
