"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      theme="dark"
      toastOptions={{
        classNames: {
          toast:
            "!bg-zinc-900 !text-zinc-100 !border-white/10",
          title: "!font-semibold",
        },
      }}
    />
  );
}
