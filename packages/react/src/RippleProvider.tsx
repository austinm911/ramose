/**
 * `RippleProvider` — one `Client`, owned by the tree.
 *
 * The provider calls `Ripple.connect(options)` in a `useMemo` keyed on `url`
 * and the *identity* of `token` / `fetch` / `webSocket`, and closes the
 * previous client when any of them change or when the provider unmounts.
 * That is the lifecycle every consumer was hand-rolling: open the next,
 * dispose the previous, dispose on leave.
 *
 * Two consequences worth spelling out:
 *
 * - `token` must be a **stable** `TokenSource` (`Ripple.token.jwt(...)` built
 *   once — module scope or a `useMemo`), not an Effect built inline in the
 *   render, or the memo key changes every render and the client re-connects
 *   every render.
 * - Multi-tenant remount is React's own `key`: `<RippleProvider key={slug}
 *   url={…}>` closes the old tenant's client and connects the new one.
 *
 * StrictMode: React mounts, runs effects, runs their cleanups, and runs the
 * effects again — with the *same* memoised value. The cleanup closes the
 * memoised client, so the second effect pass would otherwise leave a closed
 * client in the tree. The effect detects that (the entry is marked closed)
 * and bumps a generation counter that re-keys the memo, so the tree ends with
 * a fresh, open client. The extra client StrictMode's double *render*
 * discards is harmless: `connect` opens no sockets until a first read, so
 * there is nothing to close.
 */

import {
  type Client,
  type ClientOptions,
  connect,
} from "@ripple/alchemy/db";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import { RippleContext } from "./context.ts";

/**
 * `ClientOptions` plus `children`. React's own `key` is the multi-tenant
 * remount seam: change it to close the old client and connect a new one.
 */
export interface RippleProviderProps extends ClientOptions {
  readonly children?: ReactNode;
}

/** What the memo holds: the client plus whether *we* closed it. */
interface Entry {
  readonly client: Client;
  closed: boolean;
}

export const RippleProvider = (props: RippleProviderProps) => {
  const { url, token, fetch, webSocket, children } = props;
  const [generation, reconnect] = useReducer((n: number) => n + 1, 0);

  const entry = useMemo<Entry>(
    () => ({ client: connect({ url, token, fetch, webSocket }), closed: false }),
    [url, token, fetch, webSocket, generation],
  );

  useEffect(() => {
    if (entry.closed) {
      // StrictMode's mount → close → mount: the memo survived but its client
      // was closed by the first cleanup. Re-key the memo; the re-render
      // connects a fresh client and the next effect pass owns it.
      reconnect();
      return;
    }
    return () => {
      entry.closed = true;
      void entry.client.close();
    };
  }, [entry]);

  return (
    <RippleContext.Provider value={entry.client}>
      {children}
    </RippleContext.Provider>
  );
};
