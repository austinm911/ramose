/**
 * @internal The one context this package carries: the `Client` the nearest
 * `RamoseProvider` owns, plus the `token` it was built with (so
 * `useRamoseClaims` can peek without a second source of truth).
 * Deliberately not exported from the package — the public way in is
 * `useDb()` / `useRamoseClaims()`, and the public way to put one in the
 * tree is `<RamoseProvider>`.
 */
import { createContext } from "react";
export const RamoseContext = createContext(null);
//# sourceMappingURL=context.js.map