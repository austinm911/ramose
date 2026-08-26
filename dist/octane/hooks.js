/** `useRamose` and `useDb` — the two hooks every other hook here builds on. */
import { createContext, useContext, useMemo } from "octane";
import { splitSlot, subSlot } from "./internal.js";
/**
 * @internal The one context this package carries: the `Client` the nearest
 * `RamoseProvider` owns. Deliberately not exported from the package — the
 * public way in is `useRamose()`, and the public way to put one in the tree
 * is `<RamoseProvider>`.
 */
export const RamoseContext = createContext(null);
/**
 * The `Client` the nearest `<RamoseProvider>` owns.
 *
 * Throws outside a provider: a missing provider is a wiring mistake, not a
 * state to render around.
 *
 * Takes no slot: octane's `useContext` is not slot-keyed, so a trailing
 * symbol the compiler appends at the call site is simply ignored.
 */
export const useRamose = () => {
    const client = useContext(RamoseContext);
    if (client === null) {
        throw new Error("useRamose: no <RamoseProvider> above this component. " +
            'Wrap your tree in <RamoseProvider url={…}> from "./index.ts" ' +
            "and call the hook inside it.");
    }
    return client;
};
export function useDb(name, schema, ...rest) {
    const [, slot] = splitSlot(rest);
    const client = useRamose();
    return useMemo(() => client.db(name, schema), [client, name, schema], subSlot(slot, "db:memo"));
}
//# sourceMappingURL=hooks.js.map