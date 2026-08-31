/**
 * `useReceipt` — observe one invocation and re-render as it settles.
 */
import type { Receipt } from "../client/index.ts";
import { type ReceiptView } from "../react/receipt-state.ts";
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
export declare function useReceipt(receipt?: Receipt | null): ReceiptView;
//# sourceMappingURL=useReceipt.d.ts.map