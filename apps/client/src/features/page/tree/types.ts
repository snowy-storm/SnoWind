import type { DrawingType } from "@/features/page/types/page.types.ts";

export type SpaceTreeNode = {
  id: string;
  slugId: string;
  name: string;
  icon?: string;
  position: string;
  spaceId: string;
  parentPageId: string;
  hasChildren: boolean;
  isBase?: boolean;
  drawingType?: DrawingType | null;
  fileType?: string | null;
  canEdit?: boolean;
  children: SpaceTreeNode[];
};

