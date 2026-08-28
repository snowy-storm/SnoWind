import { Group, Text, Switch } from "@mantine/core";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { notifications } from "@mantine/notifications";

export default function AiChatReadOnly() {
  const { t } = useTranslation();

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t("Read-only mode")}</Text>
        <Text size="sm" c="dimmed">
          {t(
            "AI Chat can search and read workspace content, but cannot create or edit pages.",
          )}
        </Text>
      </div>

      <AiChatReadOnlyToggle />
    </Group>
  );
}

function AiChatReadOnlyToggle() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [checked, setChecked] = useState(
    workspace?.settings?.ai?.chatReadOnly,
  );

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    try {
      const updatedWorkspace = await updateWorkspace({
        aiChatReadOnly: value,
      });
      setChecked(value);
      setWorkspace(updatedWorkspace);
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message,
        color: "red",
      });
    }
  };

  return (
    <Switch
      defaultChecked={checked}
      onChange={handleChange}
      aria-label={t("Toggle AI Chat read-only mode")}
    />
  );
}
