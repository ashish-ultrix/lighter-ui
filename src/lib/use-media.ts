"use client";

import { useSyncExternalStore } from "react";

/** `null` until the browser reports, so the server render never guesses a layout. */
export function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", notify);
      return () => m.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => null,
  );
}
