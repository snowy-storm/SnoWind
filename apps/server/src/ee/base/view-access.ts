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

export function canMutateBaseView(
  view: {
    isPrivate?: boolean | null;
    creatorId?: string | null;
    isDefault?: boolean | null;
  },
  userId: string,
): boolean {
  if (view.isDefault) return true;
  if (!isPrivateOwnedView(view)) return true;
  return view.creatorId === userId;
}
