import { rem } from "@mantine/core";

interface SnoWindLogoProps {
  size?: number | string;
  className?: string;
}

const ARM_ANGLES = [0, 60, 120, 180, 240, 300];

export function SnoWindLogo({ size = 28, className }: SnoWindLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      style={{
        width: rem(size),
        height: rem(size),
        display: "block",
        flexShrink: 0,
      }}
      aria-hidden
    >
      <rect width="32" height="32" rx="7.25" fill="#111111" />
      <g
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ARM_ANGLES.map((deg) => (
          <g key={deg} transform={`rotate(${deg} 16 16)`}>
            <path d="M16 16V7.15" />
            <path d="M16 9.85l-2.95-1.95" />
            <path d="M16 9.85l2.95-1.95" />
            <path d="M16 12.55l-1.85-1.2" />
            <path d="M16 12.55l1.85-1.2" />
          </g>
        ))}
      </g>
      <circle cx="16" cy="16" r="1.55" fill="#FFFFFF" />
    </svg>
  );
}
