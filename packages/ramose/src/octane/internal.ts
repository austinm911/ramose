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
 * Ported from `packages/livestore/src/internal.ts` in the octane monorepo.
 */

/** `slot → tag → child slot`; slots are module constants, so this is bounded. */
const children = new Map<symbol, Map<string, symbol>>();
/** `tag → slot` for calls that arrive without one (an uncompiled caller). */
const bare = new Map<string, symbol>();

/**
 * A stable child slot of `slot`, namespaced by `tag`.
 *
 * `Symbol.for` keeps the identity byte-identical across HMR re-evaluations and
 * duplicate copies of this module. Memoised because this runs on every hook
 * call of every render, and the naive form pays a concat plus a global
 * registry lookup each time.
 *
 * Without a slot — an uncompiled caller, or a plain-`.ts` component, which
 * gets no injected slots but does get its own per-instance scope — the tag
 * alone is the slot: distinct per hook, stable per component instance.
 */
export const subSlot = (slot: symbol | undefined, tag: string): symbol => {
  if (slot === undefined) {
    let own = bare.get(tag);
    if (own === undefined) bare.set(tag, (own = Symbol.for(`ramose/octane:${tag}`)));
    return own;
  }
  let byTag = children.get(slot);
  if (byTag === undefined) children.set(slot, (byTag = new Map()));
  let child = byTag.get(tag);
  if (child === undefined) {
    byTag.set(tag, (child = Symbol.for(`${slot.description ?? ""}:${tag}`)));
  }
  return child;
};

/**
 * Split the compiler-appended trailing slot off a hook's arguments.
 *
 * Positional lookup is not enough: every hook here has optional or variadic
 * arguments, so the slot's index varies. Counting from the end is exact — no
 * argument any of these hooks takes is a `symbol`.
 */
export const splitSlot = (args: readonly unknown[]): [unknown[], symbol | undefined] => {
  const tail = args[args.length - 1];
  return typeof tail === "symbol"
    ? [args.slice(0, -1), tail]
    : [args as unknown[], undefined];
};
