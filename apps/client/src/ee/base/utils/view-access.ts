export function isPrivateOwnedView(view: {
  isPrivate?: boolean | null;
  isDefault?: boolean | null;
}): boolean {
  return !!view.isPrivate && !view.isDefault;
}

export function isBaseViewVisibleToUser(
  view: {
    isPrivate?: boolean | null;
    isDefault?: boolean | null;
    creatorId?: string | null;
  },
  userId: string | undefined,
): boolean {
  if (!isPrivateOwnedView(view)) return true;
  return !!userId && view.creatorId === userId;
}

export function canEditBaseView(
  view:
    | {
        isPrivate?: boolean | null;
        isDefault?: boolean | null;
        creatorId?: string | null;
      }
    | undefined,
  userId: string | undefined,
  pageCanEdit: boolean,
): boolean {
  if (!pageCanEdit || !view) return false;
  if (!isPrivateOwnedView(view)) return true;
  return !!userId && view.creatorId === userId;
}

export function sortBaseViews<
  T extends { isDefault?: boolean | null; position: string },
>(views: T[]): T[] {
  return [...views].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    if (a.position < b.position) return -1;
    if (a.position > b.position) return 1;
    return 0;
  });
}
