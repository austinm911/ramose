/**
 * The provider contract:
 *
 * - `useRipple` outside a provider throws, and the message says what to do.
 * - `useDb` identity is stable across renders and changes with `name`.
 * - A provider prop change closes the old client (the fake peer records the
 *   close on the session socket the old client had opened).
 * - StrictMode's mount → close → mount ends with an open client.
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, describe, expect, test } from "bun:test";
import * as Ripple from "@ripple/alchemy/db";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  Component,
  type ReactNode,
  StrictMode,
  useEffect,
} from "react";
import { render, renderHook, waitFor } from "@testing-library/react";
import { fakePeer, type FakePeer } from "./peer.ts";
import { RippleProvider, useDb, useRipple } from "../src/index.ts";

// imports are hoisted, so this runs after them but before any test renders —
// which is enough: nothing above touches `document` at import time. The
// unregister keeps happy-dom's globals out of the rest of the bun test run.
GlobalRegistrator.register();
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
afterAll(() => GlobalRegistrator.unregister());

const Todo = Ripple.Namespace("todo", {
  title: Ripple.Attr(Schema.String),
});
const Todos = Ripple.Catalog({ todo: Todo });
const titles = Ripple.query(Todo).select({ title: Todo.title });

const providerProps = (peer: FakePeer, url = "https://peer.example.com") => ({
  url,
  fetch: peer.fetch,
  webSocket: peer.webSocket,
});

/** Runs one read per `db`, so the client opens its session socket. */
const ReadOnce = () => {
  const db = useDb("todos", Todos);
  useEffect(() => {
    // a q on a closed client rejects (StrictMode's churn) — that is the
    // provider's job to recover from, not this probe's job to observe
    Effect.runPromise(db.q(titles)).catch(() => {});
  }, [db]);
  return null;
};

describe("useRipple", () => {
  test("outside a provider it throws, and the message names RippleProvider", () => {
    class Catcher extends Component<
      { children?: ReactNode },
      { error: Error | null }
    > {
      override state = { error: null as Error | null };
      static getDerivedStateFromError(error: Error) {
        return { error };
      }
      override render() {
        return this.state.error === null ? this.props.children : null;
      }
    }

    const Probe = () => {
      useRipple();
      return null;
    };

    let caught: Error | null = null;
    class Recording extends Catcher {
      static override getDerivedStateFromError(error: Error) {
        caught = error;
        return { error };
      }
    }

    // an error boundary observes the throw without depending on how the
    // renderer of the day re-throws uncaught render errors
    const noisy = console.error;
    console.error = () => {};
    try {
      render(
        <Recording>
          <Probe />
        </Recording>,
      );
    } finally {
      console.error = noisy;
    }
    expect(caught).not.toBeNull();
    expect(String(caught)).toMatch(/RippleProvider/);
    expect(String(caught)).toMatch(/useRipple/);
  });
});

describe("useDb", () => {
  test("identity is stable across renders, and changes with name", () => {
    const peer = fakePeer();
    const wrapper = ({ children }: { children?: ReactNode }) => (
      <RippleProvider {...providerProps(peer)}>{children}</RippleProvider>
    );

    const { result, rerender } = renderHook(
      ({ name }: { name: string }) => useDb(name, Todos),
      { wrapper, initialProps: { name: "todos" } },
    );

    const first = result.current;
    rerender({ name: "todos" });
    expect(result.current).toBe(first);

    rerender({ name: "other" });
    expect(result.current).not.toBe(first);
  });
});

describe("RippleProvider", () => {
  test("a prop change closes the old client and connects the new one", async () => {
    const peer = fakePeer();
    const ui = (url: string) => (
      <RippleProvider {...providerProps(peer, url)}>
        <ReadOnce />
      </RippleProvider>
    );

    const { rerender } = render(ui("https://a.example.com"));
    await waitFor(() => expect(peer.sockets.length).toBe(1));
    expect(peer.sockets[0]!.url).toContain("a.example.com");
    expect(peer.sockets[0]!.closed).toBe(false);

    rerender(ui("https://b.example.com"));
    await waitFor(() => expect(peer.sockets[0]!.closed).toBe(true));
    await waitFor(() => expect(peer.sockets.length).toBe(2));
    expect(peer.sockets[1]!.url).toContain("b.example.com");
    expect(peer.sockets[1]!.closed).toBe(false);
  });

  test("unmount closes the client", async () => {
    const peer = fakePeer();
    const { unmount } = render(
      <RippleProvider {...providerProps(peer)}>
        <ReadOnce />
      </RippleProvider>,
    );
    await waitFor(() => expect(peer.sockets.length).toBe(1));

    unmount();
    expect(peer.sockets[0]!.closed).toBe(true);
  });

  test("StrictMode double-mount ends with an open client", async () => {
    const peer = fakePeer();
    const seen: Ripple.Client[] = [];
    const Probe = () => {
      const client = useRipple();
      if (seen[seen.length - 1] !== client) seen.push(client);
      return <ReadOnce />;
    };

    render(
      <StrictMode>
        <RippleProvider {...providerProps(peer)}>
          <Probe />
        </RippleProvider>
      </StrictMode>,
    );

    // the client the tree ended with answers a read — the proof it is open,
    // because a read on a closed client fails rather than falling back
    await waitFor(async () => {
      const client = seen[seen.length - 1]!;
      const rows = await Effect.runPromise(client.db("todos", Todos).q(titles));
      expect(rows).toEqual([]);
    });

    // and the StrictMode churn left exactly one live socket behind
    await waitFor(() =>
      expect(peer.sockets.filter((s) => !s.closed).length).toBe(1),
    );
  });
});
