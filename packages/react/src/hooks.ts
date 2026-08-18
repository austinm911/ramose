/** `useRipple` and `useDb` — the two hooks every other hook here builds on. */

import type { Catalog, Client, Db } from "@ripple/alchemy/db";
import { useContext, useMemo } from "react";
import { RippleContext } from "./context.ts";

/**
 * The `Client` the nearest `<RippleProvider>` owns.
 *
 * Throws outside a provider: a missing provider is a wiring mistake, not a
 * state to render around.
 */
export const useRipple = (): Client => {
  const client = useContext(RippleContext);
  if (client === null) {
    throw new Error(
      "useRipple: no <RippleProvider> above this component. " +
        'Wrap your tree in <RippleProvider url={…}> from "@ripple/react" ' +
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
export const useDb = <C extends Catalog.Any>(name: string, catalog: C): Db<C> => {
  const client = useRipple();
  return useMemo(() => client.db(name, catalog), [client, name, catalog]);
};
