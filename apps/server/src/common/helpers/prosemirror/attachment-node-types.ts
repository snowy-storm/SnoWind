const ATTACHMENT_NODE_TYPES = [
  'attachment',
  'image',
  'video',
  'audio',
  'pdf',
  'excalidraw',
  'drawio',
  'mindmap',
];

export function isAttachmentNode(nodeType: string): boolean {
  return ATTACHMENT_NODE_TYPES.includes(nodeType);
}
