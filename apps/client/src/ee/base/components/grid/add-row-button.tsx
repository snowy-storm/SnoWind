import { memo, useCallback } from "react";
import { IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import classes from "@/ee/base/styles/grid.module.css";

type AddRowButtonProps = {
  onClick?: () => void;
  nested?: boolean;
  depth?: number;
  virtualIndex?: number;
  measureRef?: (node: Element | null) => void;
};

export const AddRowButton = memo(function AddRowButton({
  onClick,
  nested,
  depth = 0,
  virtualIndex,
  measureRef,
}: AddRowButtonProps) {
  const { t } = useTranslation();

  const setEl = useCallback(
    (node: HTMLDivElement | null) => {
      measureRef?.(node);
    },
    [measureRef],
  );

  const button = (
    <div
      className={clsx(classes.addRowButton, nested && classes.addRowButtonNested)}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <IconPlus size={14} />
      <span>{t("New row")}</span>
    </div>
  );

  if (!nested) return button;

  return (
    <div
      ref={setEl}
      data-index={virtualIndex}
      className={`${classes.virtualRow} ${classes.groupAddRow}`}
      style={{ "--group-depth": depth } as React.CSSProperties}
      role="row"
    >
      {button}
    </div>
  );
});
