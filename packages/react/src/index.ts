/**
 * `@ripple/react` — React bindings for Ripple. Named hooks, not a namespace:
 *
 * ```tsx
 * import { RippleProvider, useDb } from "@ripple/react";
 * ```
 *
 * `RippleProvider` owns one `Client` per subtree (connect on mount / prop
 * change, close on unmount / prop change, StrictMode-safe), `useRipple()`
 * hands it back, and `useDb(name, catalog)` memoises a `Db` from it.
 */

export { RippleProvider, type RippleProviderProps } from "./RippleProvider.tsx";
export { useDb, useRipple } from "./hooks.ts";
