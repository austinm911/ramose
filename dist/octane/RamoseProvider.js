/**
 * `RamoseProvider` — carries one `Client` down an octane tree.
 *
 * The client belongs to the application, built wherever it wants one (module
 * scope is the normal spelling, since construction is inert). This provider
 * neither creates nor closes it: a component that owned a client's lifetime
 * would tie a network session to a render tree, and an unmount — a route
 * change, a double-invoking dev render — would take the whole application's
 * synchronization down with it.
 *
 * Moving a tree to another client is therefore a prop change: pass a
 * different `client`, or remount with the renderer's own `key`. Closing the
 * old one stays with whoever built it.
 *
 * Written as a plain `.ts` component — `createElement` rather than JSX — so
 * this entry compiles with the package's ordinary `tsc` build and needs no
 * `.tsrx` step. A `Context.Provider` wrap is a single element; there is
 * nothing for JSX to buy here.
 */
import { createElement } from "octane";
import { RamoseContext } from "./hooks.js";
export const RamoseProvider = (props) => createElement(RamoseContext.Provider, {
    value: props.client,
    children: props.children,
});
//# sourceMappingURL=RamoseProvider.js.map