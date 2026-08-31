/**
 * `useReceipt` — observe one invocation and re-render as it settles.
 */
import { useSyncExternalStore } from "octane";
// Framework-neutral and shared with `../react/`: one `ReceiptView` for both
// bindings, so the two cannot drift into different mutation vocabularies.
import { IDLE } from "../react/receipt-state.js";
import { splitSlot, subSlot } from "./internal.js";
const stopNothing = () => undefined;
const observeNothing = () => stopNothing;
const readIdle = () => IDLE;
export function useReceipt(
// Every argument is optional, so a compiled call site with no arguments puts
// the slot in `receipt`'s position. Counting from the end is the only exact
// way to find it, and no argument this hook takes is a `symbol`.
...args) {
    const [rest, slot] = splitSlot(args);
    const receipt = rest[0];
    return useSyncExternalStore(receipt?.subscribe ?? observeNothing, receipt?.getSnapshot ?? readIdle, receipt?.getSnapshot ?? readIdle, subSlot(slot, "receipt:store"));
}
//# sourceMappingURL=useReceipt.js.map