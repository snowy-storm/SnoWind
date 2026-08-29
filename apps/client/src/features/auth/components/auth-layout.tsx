import React from "react";
import { Group, Text } from "@mantine/core";
import classes from "./auth.module.css";
import { SnoWindLogo } from "@/components/icons/snowind-logo.tsx";

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <>
      <Group justify="center" gap={8} className={classes.logo}>
        <SnoWindLogo size={28} />
        <Text size="28px" fw={700} style={{ userSelect: "none" }}>
          SnoWind
        </Text>
      </Group>
      <main>{children}</main>
    </>
  );
}
