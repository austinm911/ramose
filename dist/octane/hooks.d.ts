/** `useRamose` and `useDb` — the two hooks every other hook here builds on. */
import type { Client, ClientDatabase, MutationNamespace } from "../client/index.ts";
/**
 * @internal The one context this package carries: the `Client` the nearest
 * `RamoseProvider` was handed. Deliberately not exported from the package —
 * the public way in is `useRamose()`, and the public way to put one in the
 * tree is `<RamoseProvider client={…}>`.
 */
export declare const RamoseContext: import("octane").Context<Client | null>;
/**
 * The `Client` the nearest `<RamoseProvider>` carries.
 *
 * Throws outside a provider: a missing provider is a wiring mistake, not a
 * state to render around.
 *
 * Takes no slot: octane's `useContext` is not slot-keyed, so a trailing
 * symbol the compiler appends at the call site is simply ignored.
 */
export declare const useRamose: () => Client;
/**
 * The configured root database of the nearest provider's client.
 *
 * No memo and no slot, unlike the `useDb(name, schema)` this replaces: that
 * one built a fresh `Db` per call and needed both to keep its identity from
 * churning every render. `open()` is interned and inert — one map read,
 * nothing activated — so there is no identity to stabilise.
 *
 * A terminal client (closed, cleared, or fenced) throws here as it does
 * everywhere else. Recovery is a new client, not an empty render: swap the
 * `client` prop on the provider or unmount the tree.
 *
 * One context carries one client for a whole tree and cannot thread that
 * client's catalog into each consumer's types, so this answers the runtime
 * namespace by default. To read `db.mutate` with the catalog's exact
 * operations, name the namespace — `useDb<DatabaseMutations<typeof
 * AppSchema>>()` — or hold the typed client's own `open()` at module scope.
 */
export declare const useDb: <Mutations = MutationNamespace>() => ClientDatabase<Mutations>;
//# sourceMappingURL=hooks.d.ts.map