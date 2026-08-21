/**
 * `RamoseProvider` — one `Client`, owned by the tree: `Ramose.connect` in a
 * `useMemo` keyed on `url` and the identity of `token` / `fetch` /
 * `webSocket`, close in the effect cleanup on change and on unmount.
 *
 * Two rules the memo imposes on consumers:
 *
 * - `token` must be a **stable** `TokenSource` (`Ramose.token.jwt(...)` built
 *   once — module scope or a `useMemo`), not an Effect built inline in the
 *   render, or the client re-connects every render.
 * - Multi-tenant remount is the renderer's own `key`: `<RamoseProvider
 *   key={slug} url={…}>` closes the old tenant's client and connects the new
 *   one.
 *
 * Written as a plain `.ts` component — `createElement` rather than JSX — so
 * this entry compiles with the package's ordinary `tsc` build and needs no
 * `.tsrx` step. A `Context.Provider` wrap is a single element; there is
 * nothing for JSX to buy here.
 */

import { type Client, type ClientOptions, connect } from "../db/index.ts";
import {
  createElement,
  type OctaneNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "octane";
import { RamoseContext } from "./hooks.ts";
import { subSlot } from "./internal.ts";

/**
 * `ClientOptions` plus `children`. The renderer's own `key` is the
 * multi-tenant remount seam: change it to close the old client and connect a
 * new one.
 */
export interface RamoseProviderProps extends ClientOptions {
  readonly children?: OctaneNode;
}

// A plain-`.ts` component gets no compiler-injected hook slots, and needs
// none: its body runs in a scope of its own per instance, so one module
// constant per hook keys that hook for every instance independently.
const GENERATION = subSlot(undefined, "provider:generation");
const CLOSED = subSlot(undefined, "provider:closed");
const CLIENT = subSlot(undefined, "provider:client");
const LIFECYCLE = subSlot(undefined, "provider:lifecycle");

export const RamoseProvider = (props: RamoseProviderProps): OctaneNode => {
  const { url, token, fetch, webSocket, persist, follower, children } = props;
  const [generation, setGeneration] = useState(0, GENERATION);
  /** The client the last cleanup closed — identity, not a flag on the memo. */
  const closed = useRef<Client | null>(null, CLOSED);

  // a client a double render discards is harmless: `connect` opens no sockets
  // until a first read, so there is nothing to close
  const client = useMemo(
    () => connect({ url, token, fetch, webSocket, persist, follower }),
    [url, token, fetch, webSocket, persist, follower, generation],
    CLIENT,
  );

  useEffect(
    () => {
      if (closed.current === client) {
        // mount → close → mount under a double-invoking renderer: the memo
        // survived but the first cleanup closed its client. Re-key the memo;
        // the re-render connects a fresh client and the next effect pass owns
        // it.
        setGeneration((n) => n + 1);
        return;
      }
      return () => {
        closed.current = client;
        void client.close();
      };
    },
    [client],
    LIFECYCLE,
  );

  return createElement(RamoseContext.Provider, { value: client, children });
};
