import { Group, Text, Switch, Tooltip } from "@mantine/core";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { notifications } from "@mantine/notifications";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useUpgradeLabel } from "@/ee/hooks/use-upgrade-label";
import {
  isWorkspacePageVerificationEnabled,
  useHasPageVerificationLicense,
} from "@/ee/page-verification/hooks/use-page-verification-enabled";

export default function EnablePageVerification() {
  const { t } = useTranslation();

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t("Page verification")}</Text>
        <Text size="sm" c="dimmed">
          {t(
            "Let members verify page accuracy and run approval workflows.",
          )}
        </Text>
      </div>

      <PageVerificationToggle />
    </Group>
  );
}

function PageVerificationToggle() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const { isAdmin } = useUserRole();
  const hasLicense = useHasPageVerificationLicense();
  const upgradeLabel = useUpgradeLabel();
  const [checked, setChecked] = useState(
    isWorkspacePageVerificationEnabled(workspace?.settings),
  );

  const canOperate = isAdmin && hasLicense;
  const tooltipLabel = !hasLicense
    ? upgradeLabel
    : !isAdmin
      ? t("Only workspace admins can change this setting.")
      : undefined;

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    try {
      const updatedWorkspace = await updateWorkspace({
        pageVerificationEnabled: value,
      });
      setChecked(value);
      setWorkspace(updatedWorkspace);
    } catch (err) {
      notifications.show({
        message: err?.response?.data?.message,
        color: "red",
      });
    }
  };

  const switchControl = (
    <Switch
      checked={checked}
      onChange={handleChange}
      disabled={!canOperate}
      aria-label={t("Toggle page verification")}
    />
  );

  if (!tooltipLabel) {
    return switchControl;
  }

  return (
    <Tooltip label={tooltipLabel} disabled={canOperate} refProp="rootRef">
      {switchControl}
    </Tooltip>
  );
}
