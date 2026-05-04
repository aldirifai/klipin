"use client";

import { useTheme } from "next-themes";
import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      position="top-right"
      richColors
      duration={3000}
      theme={(resolvedTheme as "light" | "dark") ?? "dark"}
      toastOptions={{
        classNames: {
          title: "!font-semibold",
        },
      }}
    />
  );
}
