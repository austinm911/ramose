/**
 * The provider contract:
 *
 * - `useRamose` outside a provider throws, and the message says what to do.
 * - `useDb` identity is stable across renders and changes with `name`.
 * - A provider prop change closes the old client (the fake peer records the
 *   close on the session socket the old client had opened).
 * - Re-rendering with identical props does not churn the client.
 *
 * Octane has no `StrictMode`, so the react suite's double-mount cases have no
 * counterpart here; `RamoseProvider`'s mount → close → mount recovery still
 * exists for renderers that double-invoke, it just has nothing to trigger it
 * in this suite. What is pinned instead is the invariant that recovery serves:
 * at steady state the tree holds exactly one open client.
 */

import { render, waitFor } from "@octanejs/testing-library";
import * as Ramose from "ramose/db";
import type { Client, Db } from "ramose/db";
import { describe, expect, test } from "vitest";
import { BareRamose, ProvidedDb, Reading } from "../fixtures/provider.tsrx";
import {
  capture,
  fakePeer,
  type FakePeer,
  providerProps,
  Todos,
} from "../support/world.ts";

describe("useRamose", () => {
  test("outside a provider it throws, and the message names RamoseProvider", () => {
    expect(() => render(BareRamose)).toThrow(/RamoseProvider/);
    expect(() => render(BareRamose)).toThrow(/useRamose/);
  });
});

describe("useDb", () => {
  test("identity is stable across renders, and changes with name", () => {
    const peer = fakePeer();
    const client = providerProps(peer);
    const box = capture<Db<typeof Todos>>();
    const props = (name: string) => ({ ...client, name, report: box.report });

    const { rerender } = render(ProvidedDb, { props: props("todos") });
    const first = box.last();

    rerender({ props: props("todos") });
    expect(box.last()).toBe(first);

    rerender({ props: props("other") });
    expect(box.last()).not.toBe(first);
  });
});

describe("RamoseProvider", () => {
  /** Provider props plus a client-identity recorder. */
  const reading = (
    peer: FakePeer,
    box: { report: (client: Client) => void },
    url = "https://peer.example.com",
    token?: Ramose.TokenSource,
  ) => ({ props: { ...providerProps(peer, url), token, report: box.report } });

  test("a prop change closes the old client and connects the new one", async () => {
    const peer = fakePeer();
    const box = capture<Client>();

    const { rerender } = render(
      Reading,
      reading(peer, box, "https://a.example.com"),
    );
    await waitFor(() => expect(peer.sockets.length).toBe(1));
    expect(peer.sockets[0]!.url).toContain("a.example.com");
    expect(peer.sockets[0]!.closed).toBe(false);

    rerender(reading(peer, box, "https://b.example.com"));
    await waitFor(() => expect(peer.sockets[0]!.closed).toBe(true));
    await waitFor(() => expect(peer.sockets.length).toBe(2));
    expect(peer.sockets[1]!.url).toContain("b.example.com");
    expect(peer.sockets[1]!.closed).toBe(false);
  });

  test("a token identity change closes the old client too", async () => {
    const peer = fakePeer();
    const box = capture<Client>();
    const url = "https://peer.example.com";

    const { rerender } = render(
      Reading,
      reading(peer, box, url, Ramose.token.static("a")),
    );
    await waitFor(() => expect(peer.sockets.length).toBe(1));
    expect(peer.sockets[0]!.url).toContain("token=a");

    rerender(reading(peer, box, url, Ramose.token.static("b")));
    await waitFor(() => expect(peer.sockets[0]!.closed).toBe(true));
    await waitFor(() => expect(peer.sockets.length).toBe(2));
    expect(peer.sockets[1]!.url).toContain("token=b");
    expect(peer.sockets[1]!.closed).toBe(false);
  });

  test("re-rendering with the same props keeps the one client", async () => {
    const peer = fakePeer();
    const box = capture<Client>();

    const { rerender } = render(Reading, reading(peer, box));
    await waitFor(() => expect(peer.sockets.length).toBe(1));
    const client = box.last();

    rerender(reading(peer, box));
    rerender(reading(peer, box));
    await waitFor(() => expect(box.renders.length).toBeGreaterThan(2));

    expect(box.last()).toBe(client);
    expect(peer.sockets.filter((socket) => !socket.closed)).toHaveLength(1);
  });

  test("unmount closes the client", async () => {
    const peer = fakePeer();
    const box = capture<Client>();

    const { unmount } = render(Reading, reading(peer, box));
    await waitFor(() => expect(peer.sockets.length).toBe(1));

    unmount();
    expect(peer.sockets[0]!.closed).toBe(true);
  });
});
