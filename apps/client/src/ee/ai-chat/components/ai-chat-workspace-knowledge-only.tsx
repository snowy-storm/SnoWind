import { Group, Text, Switch } from "@mantine/core";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { notifications } from "@mantine/notifications";

export default function AiChatWorkspaceKnowledgeOnly() {
  const { t } = useTranslation();

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t("Workspace knowledge only")}</Text>
        <Text size="sm" c="dimmed">
          {t(
            "Restrict AI Chat to answering from your workspace pages and uploaded files only. It will not use outside knowledge.",
          )}
        </Text>
      </div>

      <AiChatWorkspaceKnowledgeOnlyToggle />
    </Group>
  );
}

function AiChatWorkspaceKnowledgeOnlyToggle() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [checked, setChecked] = useState(
    workspace?.settings?.ai?.chatWorkspaceKnowledgeOnly,
  );

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    try {
      const updatedWorkspace = await updateWorkspace({
        aiChatWorkspaceKnowledgeOnly: value,
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
      aria-label={t("Toggle workspace knowledge only")}
    />
  );
}
