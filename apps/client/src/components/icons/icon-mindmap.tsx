import { rem } from "@mantine/core";

interface Props {
  size?: number | string;
  className?: string;
  color?: string;
}

function IconMindmap({ size, className, color }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      className={className}
      style={{ width: rem(size), height: rem(size), color }}
    >
      <circle cx="12" cy="5" r="3" fill="currentColor" />
      <circle cx="5" cy="18" r="2.5" fill="currentColor" />
      <circle cx="12" cy="19" r="2.5" fill="currentColor" />
      <circle cx="19" cy="18" r="2.5" fill="currentColor" />
      <path
        d="M12 8v6M12 14L5.8 16.2M12 14l6.2 2.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default IconMindmap;
