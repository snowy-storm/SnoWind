import { IconSearch } from "@tabler/icons-react";
import cx from "clsx";
import {
  ActionIcon,
  Group,
  rem,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import classes from "./search-control.module.css";
import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSetAtom } from "jotai";
import {
  openGlobalSearch,
  openPageFind,
} from "@/features/search/open-search-spotlight";
import { searchControlAnchorAtom } from "@/features/page-find/atoms/page-find-atom";

type SearchControlProps = {
  className?: string;
  /** Opens global search when the search box is clicked. */
  onClick?: () => void;
  /** When false, hide the 本页 option (e.g. share pages). Default true. */
  enablePageFind?: boolean;
};

export function SearchControl({
  className,
  onClick,
  enablePageFind = true,
}: SearchControlProps) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const setAnchor = useSetAtom(searchControlAnchorAtom);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const publish = () => {
      const rect = el.getBoundingClientRect();
      setAnchor({
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        bottom: Math.round(rect.bottom),
      });
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    window.addEventListener("resize", publish);
    window.addEventListener("scroll", publish, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
      window.removeEventListener("scroll", publish, true);
      setAnchor(null);
    };
  }, [setAnchor]);

  const openGlobal = () => {
    (onClick ?? openGlobalSearch)();
  };

  return (
    <div ref={wrapRef} className={cx(classes.wrap, className)}>
      <UnstyledButton
        className={classes.root}
        onClick={openGlobal}
        aria-label={t("Search")}
      >
        <Group gap="xs" wrap="nowrap">
          <IconSearch style={{ width: rem(15), height: rem(15) }} stroke={1.5} />
          <Text fz="sm" c="dimmed">
            {t("Search")}
          </Text>
        </Group>
      </UnstyledButton>

      <Group gap={4} wrap="nowrap">
        <UnstyledButton
          className={classes.modeBtn}
          onClick={openGlobal}
          aria-label={t("Global")}
        >
          <Text fw={700} fz={11}>
            {t("Global")}
          </Text>
        </UnstyledButton>
        {enablePageFind && (
          <UnstyledButton
            className={classes.modeBtn}
            onClick={() => openPageFind()}
            aria-label={t("This page")}
          >
            <Text fw={700} fz={11}>
              {t("This page")}
            </Text>
          </UnstyledButton>
        )}
      </Group>
    </div>
  );
}

interface SearchMobileControlProps {
  onSearch: () => void;
}

export function SearchMobileControl({ onSearch }: SearchMobileControlProps) {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("Search")} withArrow>
      <ActionIcon
        variant="subtle"
        color="dark"
        aria-label={t("Search")}
        onClick={onSearch}
        size="sm"
      >
        <IconSearch size={20} stroke={2} />
      </ActionIcon>
    </Tooltip>
  );
}
