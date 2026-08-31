/**
 * @internal Hook slots for this entry's hand-written hooks.
 *
 * Octane keys every hook by a per-call-site `symbol` appended as the **last**
 * argument of the call. In a `.tsrx` / `.tsx` component the compiler injects
 * it; these modules are plain `.ts` published as source, so each hook here
 * takes the caller's slot off its own argument list (`splitSlot`) and mints a
 * distinct, stable child slot for every octane hook it composes (`subSlot`).
 * That is what `"octane": { "hookSlots": { "manual": [...] } }` in
 * `package.json` declares: this directory slots itself.
 *
 * `subSlot` is octane's own shared binding helper (`createSubSlot`, public
 * since 0.1.44); the slotless prefix keeps an uncompiled caller's tag-only
 * slots off every other binding's symbols.
 */
import { createSubSlot } from "octane";
export const subSlot = createSubSlot({ slotlessPrefix: "ramose/octane:" });
/**
 * Split the compiler-appended trailing slot off a hook's arguments.
 *
 * Positional lookup is not enough: every hook here has optional or variadic
 * arguments, so the slot's index varies. Counting from the end is exact — no
 * argument any of these hooks takes is a `symbol`.
 */
export const splitSlot = (args) => {
    const tail = args[args.length - 1];
    return typeof tail === "symbol"
        ? [args.slice(0, -1), tail]
        : [args, undefined];
};
//# sourceMappingURL=internal.js.map