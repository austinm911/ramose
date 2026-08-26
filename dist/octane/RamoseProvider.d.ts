/**
 * `RamoseProvider` — one `Client`, owned by the tree: `Ramose.connect` in a
 * `useMemo` keyed on `url` and the identity of `token` / `fetch` /
 * `webSocket`, close in the effect cleanup on change and on unmount.
 *
 * Two rules the memo imposes on consumers:
 *
 * - `token` must be a **stable** `TokenSource` (`Ramose.token.jwt(...)` built
 *   once — module scope or a `useMemo`), not an Effect built inline in the
 *   render, or the client re-connects every render.
 * - Multi-tenant remount is the renderer's own `key`: `<RamoseProvider
 *   key={slug} url={…}>` closes the old tenant's client and connects the new
 *   one.
 *
 * Written as a plain `.ts` component — `createElement` rather than JSX — so
 * this entry compiles with the package's ordinary `tsc` build and needs no
 * `.tsrx` step. A `Context.Provider` wrap is a single element; there is
 * nothing for JSX to buy here.
 */
import { type ClientOptions } from "../db/index.ts";
import { type OctaneNode } from "octane";
/**
 * `ClientOptions` plus `children`. The renderer's own `key` is the
 * multi-tenant remount seam: change it to close the old client and connect a
 * new one.
 */
export interface RamoseProviderProps extends ClientOptions {
    readonly children?: OctaneNode;
}
export declare const RamoseProvider: (props: RamoseProviderProps) => OctaneNode;
//# sourceMappingURL=RamoseProvider.d.ts.map