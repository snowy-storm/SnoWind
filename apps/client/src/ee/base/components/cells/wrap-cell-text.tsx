import { useRef, useState } from "react";
import { Tooltip } from "@mantine/core";
import clsx from "clsx";
import gridClasses from "@/ee/base/styles/grid.module.css";

type WrapCellTextProps = {
  children: string;
  className?: string;
};

function isOverflowing(el: HTMLElement): boolean {
  if (el.scrollHeight > el.clientHeight + 1) return true;
  const parent = el.parentElement;
  return !!parent && parent.scrollHeight > parent.clientHeight + 1;
}

export function WrapCellText({ children, className }: WrapCellTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowed, setOverflowed] = useState(false);

  const handleMouseEnter = () => {
    const el = ref.current;
    if (el) setOverflowed(isOverflowing(el));
  };

  return (
    <Tooltip
      label={children}
      disabled={!overflowed || !children}
      multiline
      maw={420}
      withArrow
      withinPortal
      openDelay={400}
    >
      <span
        ref={ref}
        className={clsx(gridClasses.cellContent, className)}
        onMouseEnter={handleMouseEnter}
      >
        {children}
      </span>
    </Tooltip>
  );
}
