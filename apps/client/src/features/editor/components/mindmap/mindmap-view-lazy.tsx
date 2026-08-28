import { lazy, Suspense } from "react";
import { NodeViewProps } from "@tiptap/react";

const MindmapView = lazy(
  () => import("@/features/editor/components/mindmap/mindmap-view.tsx"),
);

export default function MindmapViewLazy(props: NodeViewProps) {
  return (
    <Suspense fallback={null}>
      <MindmapView {...props} />
    </Suspense>
  );
}
