import { useCallback } from "react";
import type { ReactNode } from "react";
import { UnstyledButton, Text } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  IBaseProperty,
  SelectTypeOptions,
} from "@/ee/base/types/base.types";
import { useReferenceStore } from "@/ee/base/reference/reference-store";
import { ChoiceBadge } from "@/ee/base/components/cells/choice-badge";
import { choiceColor } from "@/ee/base/components/cells/choice-color";
import { PersonReadList } from "@/ee/base/components/cells/person-read-list";
import {
  formatGroupLabel,
  isEmptyGroupValue,
} from "@/ee/base/utils/table-grouping";
import classes from "@/ee/base/styles/grid.module.css";

type GridGroupHeaderProps = {
  id: string;
  depth: number;
  count: number;
  collapsed: boolean;
  property: IBaseProperty;
  rawValue: unknown;
  virtualIndex: number;
  measureRef: (node: Element | null) => void;
  pageId: string;
  onToggle: (id: string) => void;
};

function personIdsFrom(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string" && value) return [value];
  return [];
}

export function GridGroupHeader({
  id,
  depth,
  count,
  collapsed,
  property,
  rawValue,
  virtualIndex,
  measureRef,
  pageId,
  onToggle,
}: GridGroupHeaderProps) {
  const { t } = useTranslation();
  const references = useReferenceStore(pageId);
  const empty = isEmptyGroupValue(rawValue);
  const label = formatGroupLabel(property, rawValue, t, references);

  const handleToggle = useCallback(() => {
    onToggle(id);
  }, [id, onToggle]);

  const setEl = useCallback(
    (node: HTMLDivElement | null) => {
      measureRef(node);
    },
    [measureRef],
  );

  let valueNode: ReactNode;
  if (empty) {
    valueNode = (
      <Text size="sm" c="dimmed" fw={600} truncate>
        {t("No value")}
      </Text>
    );
  } else if (property.type === "select" || property.type === "status") {
    const opts = property.typeOptions as SelectTypeOptions | undefined;
    const choice = opts?.choices?.find((c) => c.id === rawValue);
    valueNode = choice ? (
      <ChoiceBadge name={choice.name} style={choiceColor(choice.color)} />
    ) : (
      <Text size="sm" fw={600} truncate>
        {label}
      </Text>
    );
  } else if (property.type === "multiSelect") {
    const opts = property.typeOptions as SelectTypeOptions | undefined;
    const ids = personIdsFrom(rawValue);
    valueNode = (
      <span className={classes.groupHeaderBadges}>
        {ids.map((cid) => {
          const choice = opts?.choices?.find((c) => c.id === cid);
          return choice ? (
            <ChoiceBadge
              key={cid}
              name={choice.name}
              style={choiceColor(choice.color)}
            />
          ) : (
            <Text key={cid} size="sm" fw={600}>
              {cid}
            </Text>
          );
        })}
      </span>
    );
  } else if (property.type === "person" || property.type === "lastEditedBy") {
    valueNode = (
      <PersonReadList
        personIds={personIdsFrom(rawValue)}
        users={references.users}
      />
    );
  } else {
    valueNode = (
      <Text size="sm" fw={600} truncate>
        {label}
      </Text>
    );
  }

  const Chevron = collapsed ? IconChevronRight : IconChevronDown;

  return (
    <div
      ref={setEl}
      data-index={virtualIndex}
      className={`${classes.row} ${classes.virtualRow} ${classes.groupHeaderRow}`}
      data-depth={depth}
      role="row"
      aria-rowindex={virtualIndex + 1}
      aria-expanded={!collapsed}
    >
      <UnstyledButton
        className={classes.groupHeaderCell}
        style={{ "--group-depth": depth } as React.CSSProperties}
        onClick={handleToggle}
        aria-label={t("Toggle group")}
      >
        <Chevron size={14} className={classes.groupHeaderChevron} />
        <span className={classes.groupHeaderValue}>{valueNode}</span>
        <span className={classes.groupHeaderCount}>{count}</span>
      </UnstyledButton>
    </div>
  );
}
