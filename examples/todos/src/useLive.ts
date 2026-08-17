import type { LiveStore } from "@ripple/alchemy/schema";
import { useSyncExternalStore } from "react";

export const useLive = <T>(store: LiveStore<T>): T | undefined =>
  useSyncExternalStore(store.subscribe, store.get);
