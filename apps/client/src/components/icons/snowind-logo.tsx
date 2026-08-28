import { rem } from "@mantine/core";
import { useId } from "react";

interface SnoWindLogoProps {
  size?: number | string;
  className?: string;
}

export function SnoWindLogo({ size = 28, className }: SnoWindLogoProps) {
  const reactId = useId();
  const gradientId = `snowind-logo-bg-${reactId.replace(/:/g, "")}`;

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
      <defs>
        <linearGradient
          id={gradientId}
          x1="4"
          y1="2"
          x2="28"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#0B3A5C" />
          <stop offset=".48" stopColor="#0284C7" />
          <stop offset="1" stopColor="#7DD3FC" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7.25" fill={`url(#${gradientId})`} />
      <path
        d="M6.15 16.05C11.5 8.7 19.35 8.35 26.7 14.7"
        stroke="#fff"
        strokeWidth="3.15"
        strokeLinecap="round"
      />
      <path
        d="M5.15 22.35C10.5 15 18.35 14.65 25.7 21"
        stroke="#fff"
        strokeWidth="3.15"
        strokeLinecap="round"
      />
      <path
        fill="#fff"
        d="M24.85 6.55 25.42 9.08 27.9 9.6 25.42 10.12 24.85 12.65 24.28 10.12 21.8 9.6 24.28 9.08Z"
      />
    </svg>
  );
}
