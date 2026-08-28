import {
  ActionIcon,
  Group,
  LoadingOverlay,
  Modal,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconArrowsMaximize, IconArrowsMinimize } from "@tabler/icons-react";
import clsx from "clsx";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import classes from "./drawing-editor-modal.module.css";

type DrawingEditorModalProps = {
  opened: boolean;
  onClose: () => void;
  title: string;
  isSaving?: boolean;
  actions?: ReactNode;
  children: ReactNode;
};

export function DrawingEditorModal({
  opened,
  onClose,
  title,
  isSaving,
  actions,
  children,
}: DrawingEditorModalProps) {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(true);

  useEffect(() => {
    if (opened) setMaximized(true);
  }, [opened]);

  useLayoutEffect(() => {
    if (!opened) return;
    const frame = requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
    return () => cancelAnimationFrame(frame);
  }, [opened, maximized]);

  return (
    <Modal.Root
      opened={opened}
      onClose={onClose}
      fullScreen
      padding={0}
      yOffset={0}
      xOffset={0}
      closeOnEscape={false}
      closeOnClickOutside={false}
      trapFocus={false}
      returnFocus={false}
      aria-label={title}
    >
      <Modal.Overlay />
      <Modal.Content
        className={classes.content}
        styles={{
          inner: { padding: 0 },
          content: {
            background: "transparent",
            boxShadow: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            height: "100%",
            maxHeight: "100%",
            width: "100%",
          },
        }}
      >
        <div
          className={clsx(
            classes.shell,
            maximized ? classes.maximized : classes.windowed,
          )}
        >
          <Group
            className={classes.header}
            justify="space-between"
            wrap="nowrap"
            px="xs"
            py={4}
            gap="xs"
          >
            <Text size="sm" fw={600} truncate>
              {title}
            </Text>
            <Group gap={6} wrap="nowrap">
              {actions}
              <Tooltip
                label={maximized ? t("Restore window") : t("Maximize")}
                openDelay={400}
              >
                <ActionIcon
                  variant="default"
                  size="sm"
                  aria-label={maximized ? t("Restore window") : t("Maximize")}
                  onClick={() => setMaximized((value) => !value)}
                >
                  {maximized ? (
                    <IconArrowsMinimize size={16} />
                  ) : (
                    <IconArrowsMaximize size={16} />
                  )}
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
          <Modal.Body p={0} className={classes.body}>
            <LoadingOverlay visible={Boolean(isSaving)} />
            <div className={classes.canvas}>{opened ? children : null}</div>
          </Modal.Body>
        </div>
      </Modal.Content>
    </Modal.Root>
  );
}
