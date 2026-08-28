import { uploadFile } from "@/features/page/services/page-service.ts";
import { svgStringToFile } from "@/lib/utils";
import type { IAttachment } from "@/features/attachments/types/attachment.types";
import type { MindMapCanvasHandle } from "./mindmap-canvas";
import { dataUrlToFile, exportResultToSvgString } from "./mindmap-lib";

export type MindmapSavePayload = {
  data: string;
  src?: string;
  title?: string;
  size?: number;
  attachmentId?: string;
};

export async function captureMindmapPayload(
  canvas: MindMapCanvasHandle,
  pageId?: string,
  attachmentId?: string,
): Promise<MindmapSavePayload> {
  const data = canvas.getData();
  const payload: MindmapSavePayload = { data };
  if (!pageId) return payload;

  try {
    const svgDataUrl = await canvas.exportFile("svg", "mindmap", false);
    const svgString = exportResultToSvgString(svgDataUrl);
    const file = svgString.trim().startsWith("<")
      ? await svgStringToFile(svgString, "mindmap.svg")
      : dataUrlToFile(svgDataUrl, "mindmap.svg");
    const attachment: IAttachment = attachmentId
      ? await uploadFile(file, pageId, attachmentId)
      : await uploadFile(file, pageId);
    payload.src = `/api/files/${attachment.id}/${attachment.fileName}?t=${new Date(attachment.updatedAt).getTime()}`;
    payload.title = attachment.fileName;
    payload.size = attachment.fileSize;
    payload.attachmentId = attachment.id;
  } catch {
    /* JSON is enough to reopen the editor */
  }

  return payload;
}
