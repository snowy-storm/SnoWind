import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { IWorkspaceSettings } from "@/features/workspace/types/workspace.types";

export function isWorkspacePageVerificationEnabled(
  settings?: IWorkspaceSettings | null,
): boolean {
  return settings?.pageVerification?.enabled !== false;
}

export function useHasPageVerificationLicense(): boolean {
  return useHasFeature(Feature.PAGE_VERIFICATION);
}

export function usePageVerificationEnabled(): boolean {
  const hasLicense = useHasPageVerificationLicense();
  const [workspace] = useAtom(workspaceAtom);
  return (
    hasLicense && isWorkspacePageVerificationEnabled(workspace?.settings)
  );
}
