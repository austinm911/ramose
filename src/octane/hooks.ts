/** `useRamose` and `useDb` — the two hooks every other hook here builds on. */

import type {
  Client,
  ClientDatabase,
  MutationNamespace,
} from "../client/index.ts";
import { createContext, useContext } from "octane";

/**
 * @internal The one context this package carries: the `Client` the nearest
 * `RamoseProvider` was handed. Deliberately not exported from the package —
 * the public way in is `useRamose()`, and the public way to put one in the
 * tree is `<RamoseProvider client={…}>`.
 */
export const RamoseContext = createContext<Client | null>(null);

/**
 * The `Client` the nearest `<RamoseProvider>` carries.
 *
 * Throws outside a provider: a missing provider is a wiring mistake, not a
 * state to render around.
 *
 * Takes no slot: octane's `useContext` is not slot-keyed, so a trailing
 * symbol the compiler appends at the call site is simply ignored.
 */
export const useRamose = (): Client => {
  const client = useContext(RamoseContext);
  if (client === null) {
    throw new Error(
      "useRamose: no <RamoseProvider client={…}> above this component. " +
        'Wrap your tree in <RamoseProvider client={…}> from "./index.ts" ' +
        "and call the hook inside it.",
    );
  }
  return client;
};

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
export const useDb = <Mutations = MutationNamespace>(): ClientDatabase<
  Mutations
> => useRamose().open() as ClientDatabase<Mutations>;
