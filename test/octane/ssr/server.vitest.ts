/**
 * SSR: the read hooks render synchronously with no DOM and subscribe to
 * nothing.
 *
 * The peer is the assertion. Every subscription in this entry lives in an
 * effect, and octane's server hooks do not run effects — so a server render
 * must produce zero sockets and zero HTTPS calls, not merely "eventually
 * consistent" output. `useBasis` on a pinned view is the one read that has an
 * answer without asking, and it must still give it here.
 */

import * as octaneRuntime from "octane";
import { renderToStaticMarkup } from "octane/server";
import * as Ramose from "ramose/db";
import { describe, expect, test, vi } from "vitest";
import { ServerPinned, ServerReads } from "../fixtures/server.tsrx";
import { fakePeer, Todos } from "../support/world.ts";

describe("ramose/octane on the server", () => {
  test("the binding's bare `octane` import is the server runtime", () => {
    // What an SSR build's own resolution does, and what vitest.ssr.config.ts
    // reproduces with an alias. Without it the hooks under test would be the
    // client twins and this suite would be testing the wrong runtime.
    expect("renderToStaticMarkup" in octaneRuntime).toBe(true);
    expect("createRoot" in octaneRuntime).toBe(false);
  });

  test("every read hook renders synchronously, and nothing subscribes", () => {
    expect(typeof document).toBe("undefined");

    const peer = fakePeer();
    const webSocket = vi.fn(peer.webSocket);
    const client = Ramose.connect({
      url: "https://peer.example.com",
      fetch: peer.fetch,
      webSocket: webSocket as unknown as typeof WebSocket,
    });

    const { html, css } = renderToStaticMarkup(ServerReads, {
      db: client.db("todos", Todos),
    });

    // `useLive` has no rows and no ticks, `useQuery` is loading with no data,
    // `useBasis` has no answer: the whole surface is its initial state.
    expect(html).toBe('<p id="server-state">null/0/true/null/-</p>');
    expect(css).toBe("");

    expect(webSocket).not.toHaveBeenCalled();
    expect(peer.sockets).toHaveLength(0);
    expect(peer.frames).toHaveLength(0);
    expect(peer.calls).toHaveLength(0);
  });

  test("a pinned view answers its coordinate without asking the peer", () => {
    const peer = fakePeer();
    const client = Ramose.connect({
      url: "https://peer.example.com",
      fetch: peer.fetch,
      webSocket: peer.webSocket,
    });

    const { html } = renderToStaticMarkup(ServerPinned, {
      db: client.db("todos", Todos),
      t: 12,
    });

    expect(html).toBe('<p id="pinned-basis">12</p>');
    expect(peer.sockets).toHaveLength(0);
    expect(peer.calls).toHaveLength(0);
  });
});
