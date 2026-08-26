"use client";
/**
 * `ramose/react` — React bindings for Ramose. Named hooks, not a namespace:
 *
 * ```tsx
 * import { RamoseProvider, useDb } from "ramose/react";
 * ```
 *
 * `RamoseProvider` owns one `Client` per subtree (connect on mount / prop
 * change, close on unmount / prop change, StrictMode-safe), and
 * `useDb(name, schema)` memoises a `Db` from it. On top sit the reads —
 * `useLiveQuery` / `useQuery`, `useLivePull` / `usePull`, `useBasis`
 * (where the basis is) — all returning the same `Read` shape — plus
 * `useConnectionStatus()` (session-backed), `usePrincipal(db)` /
 * `useRamoseClaims()` for who the session is, `useOperation(db, op)` as
 * the pending / error helper around `db.run`, and `errorMessage` for
 * toast text.
 *
 * This entry and every hook module it re-exports open with `"use client"`
 * so a Next App Router / React Router server-component import compiles.
 * Read hooks accept `{ initialData, initialT, suspense }` so a server
 * `db.query` can hydrate the first paint.
 * Keep the directive as the first statement — bundlers and `tsc` emit
 * look for that, and `test/react/use-client.test.ts` pins it.
 */
export { RamoseProvider } from "./RamoseProvider.js";
export { useDb, useRamoseClaims } from "./hooks.js";
export {} from "../db/index.js";
export { useConnectionStatus } from "./useConnectionStatus.js";
export {} from "./read.js";
export { useLiveQuery } from "./useLiveQuery.js";
export { useQuery } from "./useQuery.js";
export { useLivePull, usePull } from "./usePull.js";
export { useBasis } from "./useBasis.js";
export { usePrincipal } from "./usePrincipal.js";
export { useOperation, } from "./useOperation.js";
export { errorMessage } from "./errors.js";
//# sourceMappingURL=index.js.map