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
 * `useLive` turns a standing read into state, `useTransact()` runs writes
 * from event handlers (works with or without the provider), and
 * `errorMessage` turns any failure into toast text.
 */

export { RippleProvider, type RippleProviderProps } from "./RippleProvider.tsx";
export { useDb, useRipple } from "./hooks.ts";
export { type Live, useLive } from "./useLive.ts";
export { type Transact, useTransact } from "./useTransact.ts";
export { errorMessage } from "./errors.ts";
