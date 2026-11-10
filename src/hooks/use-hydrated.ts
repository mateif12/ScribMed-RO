"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * True only after hydration. Used to keep submit buttons disabled until React
 * handles the submit event – otherwise a pre-hydration click would trigger a
 * native form submission (and, for GET forms, put credentials in the URL).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
