"use client";

import { AuthProvider } from "@/lib/auth";

export function AuthClientProvider({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
