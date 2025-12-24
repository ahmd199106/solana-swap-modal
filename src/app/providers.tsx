"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "react-hot-toast";
import { TurnkeyProvider } from "@/providers/TurnkeyProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30000, // 30 seconds
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TurnkeyProvider>
        {children}
        <Toaster position="top-right" />
      </TurnkeyProvider>
    </QueryClientProvider>
  );
}
