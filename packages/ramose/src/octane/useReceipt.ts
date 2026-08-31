/**
 * `useReceipt` — observe one invocation and re-render as it settles.
 */

import { useSyncExternalStore } from "octane";
import type { Receipt } from "../client/index.ts";
// Framework-neutral and shared with `../react/`: one `ReceiptView` for both
// bindings, so the two cannot drift into different mutation vocabularies.
import { IDLE, type ReceiptView } from "../react/receipt-state.ts";
import { splitSlot, subSlot } from "./internal.ts";

const stopNothing = (): void => undefined;
const observeNothing = (): (() => void) => stopNothing;
const readIdle = (): ReceiptView => IDLE;

/**
 * A receipt already *is* the external store this hook needs — `subscribe` and
 * `getSnapshot` are frozen onto it when the invocation is created — so there is
 * nothing to intern and no store cache here. Two receipts are two invocations,
 * never the same one under another name.
 *
 * ```ts
 * const [receipt, setReceipt] = useState<Receipt | null>(null);
 * const state = useReceipt(receipt);
 * ```
 *
 * `null` and `undefined` read as `idle`, so a component may call this hook
 * unconditionally on the render before its user acts.
 *
 * Hold the receipt in state. Rebuilding it while rendering — calling the
 * mutation in the render body — invokes once per render.
 *
 * Unmounting cancels nothing: a queued invocation is durable and proceeds
 * without an observer. A later component handed the same receipt reads whatever
 * state it reached meanwhile, terminal states included.
 */
export function useReceipt(receipt?: Receipt | null): ReceiptView;
export function useReceipt(
  // Every argument is optional, so a compiled call site with no arguments puts
  // the slot in `receipt`'s position. Counting from the end is the only exact
  // way to find it, and no argument this hook takes is a `symbol`.
  ...args: [receipt?: Receipt | null, slot?: symbol]
): ReceiptView {
  const [rest, slot] = splitSlot(args);
  const receipt = rest[0] as Receipt | null | undefined;
  return useSyncExternalStore<ReceiptView>(
    receipt?.subscribe ?? observeNothing,
    receipt?.getSnapshot ?? readIdle,
    receipt?.getSnapshot ?? readIdle,
    subSlot(slot, "receipt:store"),
  );
}
