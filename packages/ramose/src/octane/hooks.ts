/** `useRamose` and `useDb` — the two hooks every other hook here builds on. */

import type { Catalog, Client, Db } from "../db/index.ts";
import { createContext, useContext, useMemo } from "octane";
import { splitSlot, subSlot } from "./internal.ts";

/**
 * @internal The one context this package carries: the `Client` the nearest
 * `RamoseProvider` owns. Deliberately not exported from the package — the
 * public way in is `useRamose()`, and the public way to put one in the tree
 * is `<RamoseProvider>`.
 */
export const RamoseContext = createContext<Client | null>(null);

/**
 * The `Client` the nearest `<RamoseProvider>` owns.
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
      "useRamose: no <RamoseProvider> above this component. " +
        'Wrap your tree in <RamoseProvider url={…}> from "./index.ts" ' +
        "and call the hook inside it.",
    );
  }
  return client;
};

/**
 * `client.db(name, catalog)`, memoised on `[client, name, catalog]`.
 *
 * The call itself is pure — no network, no ensure, no socket — so the memo is
 * purely about identity: a stable `Db` reference means effects and memos
 * keyed on it do not re-fire every render. Pass a module-scope catalog (the
 * normal spelling) or the identity changes every render and the memo is
 * worthless.
 */
export function useDb<C extends Catalog.Any>(name: string, catalog: C): Db<C>;
export function useDb<C extends Catalog.Any>(
  name: string,
  catalog: C,
  ...rest: [slot?: symbol]
): Db<C> {
  const [, slot] = splitSlot(rest);
  const client = useRamose();
  return useMemo(
    () => client.db(name, catalog),
    [client, name, catalog],
    subSlot(slot, "db:memo"),
  );
}
