"use client";

import { Toaster } from "sonner";

export function ToastProvider() {
  return (
    <Toaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        className: "border border-border bg-card text-card-foreground",
      }}
    />
  );
}
