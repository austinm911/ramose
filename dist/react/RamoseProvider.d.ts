/**
 * `RamoseProvider` — one `Client`, owned by the tree: `Ramose.connect` in a
 * `useMemo` keyed on `url` and the identity of `token` / `fetch` /
 * `webSocket`, close in the effect cleanup on change and on unmount.
 *
 * Two rules the memo imposes on consumers:
 *
 * - `token` must be a **stable** `TokenSource` (`Ramose.token.jwt(...)` built
 *   once — module scope or a `useMemo`) or a stable string, not a function
 *   built inline in the render, or the client re-connects every render.
 * - Multi-tenant remount is React's own `key`: `<RamoseProvider key={slug}
 *   url={…}>` closes the old tenant's client and connects the new one.
 */
import { type ClientOptions } from "../db/index.ts";
import { type ReactNode } from "react";
/**
 * `ClientOptions` plus `children`. React's own `key` is the multi-tenant
 * remount seam: change it to close the old client and connect a new one.
 */
export interface RamoseProviderProps extends ClientOptions {
    readonly children?: ReactNode;
}
export declare const RamoseProvider: (props: RamoseProviderProps) => import("react").JSX.Element;
//# sourceMappingURL=RamoseProvider.d.ts.map