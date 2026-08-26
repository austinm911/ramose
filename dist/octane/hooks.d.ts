/** `useRamose` and `useDb` — the two hooks every other hook here builds on. */
import type { Schema, Client, Db } from "../db/index.ts";
/**
 * @internal The one context this package carries: the `Client` the nearest
 * `RamoseProvider` owns. Deliberately not exported from the package — the
 * public way in is `useRamose()`, and the public way to put one in the tree
 * is `<RamoseProvider>`.
 */
export declare const RamoseContext: import("octane").Context<Client | null>;
/**
 * The `Client` the nearest `<RamoseProvider>` owns.
 *
 * Throws outside a provider: a missing provider is a wiring mistake, not a
 * state to render around.
 *
 * Takes no slot: octane's `useContext` is not slot-keyed, so a trailing
 * symbol the compiler appends at the call site is simply ignored.
 */
export declare const useRamose: () => Client;
/**
 * `client.db(name, schema)`, memoised on `[client, name, schema]`.
 *
 * The call itself is pure — no network, no ensure, no socket — so the memo is
 * purely about identity: a stable `Db` reference means effects and memos
 * keyed on it do not re-fire every render. Pass a module-scope schema (the
 * normal spelling) or the identity changes every render and the memo is
 * worthless.
 */
export declare function useDb<C extends Schema.Any>(name: string, schema: C): Db<C>;
//# sourceMappingURL=hooks.d.ts.map