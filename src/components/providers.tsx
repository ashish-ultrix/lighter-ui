"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { SessionProvider } from "@/lib/session";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 2000, refetchOnWindowFocus: true } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>{children}</SessionProvider>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: { background: "var(--color-panel)", border: "1px solid var(--color-line)", color: "var(--color-fg)" },
        }}
      />
    </QueryClientProvider>
  );
}
