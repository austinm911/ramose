/**
 * `useSyncState` — the session's synchronization state as component state.
 */
import { useContext, useSyncExternalStore } from "octane";
import { RamoseContext } from "./hooks.js";
import { splitSlot, subSlot } from "./internal.js";
export function useSyncState(
// Both arguments are optional, so a compiled call site with no arguments
// puts the slot in `source`'s position — which then reads as a client and
// reports a missing provider. Counting from the end is the only exact way to
// find it, and no argument this hook takes is a `symbol`.
...args) {
    const [rest, slot] = splitSlot(args);
    const source = rest[0];
    const provided = useContext(RamoseContext);
    const sync = (source ?? provided)?.sync;
    if (sync === undefined) {
        throw new Error("useSyncState: no <RamoseProvider> above this component and no client " +
            "or database passed. Wrap your tree in <RamoseProvider client={…}> or " +
            "call useSyncState(client).");
    }
    return useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getSnapshot, subSlot(slot, "sync:store"));
}
//# sourceMappingURL=useSyncState.js.map