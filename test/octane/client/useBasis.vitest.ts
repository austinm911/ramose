/**
 * `useBasis` — where the basis is:
 *
 * - a live view reads `session.t` synchronously and again on every
 *   `{ op: "tx" }` / resync — no `GET /info` per tick;
 * - an `asOf(t)` view answers `t` on the first render, with no request and
 *   no socket;
 * - switching views re-answers, still without a request when pinned.
 */

import { render, waitFor } from "@octanejs/testing-library";
import * as Ramose from "ramose/db";
import { describe, expect, test } from "vitest";
import { BasisSwitching, BasisWatching } from "../fixtures/reads.tsrx";
import {
  type Call,
  capture,
  fakePeer,
  type FakePeer,
  Todos,
} from "../support/world.ts";

const infoCalls = (calls: readonly Call[]) =>
  calls.filter((call) => call.url.includes("/info"));

/** A peer whose `/info` answers the basis the test is currently pretending to. */
const basisPeer = (state: { t: number }): FakePeer =>
  fakePeer({
    answer: () => ({ body: { t: state.t, result: [] } }),
    http: (call) =>
      call.url.includes("/info")
        ? { body: { db: "todos", t: state.t } }
        : undefined,
  });

const dbOver = (peer: FakePeer) =>
  Ramose.connect({
    url: "https://peer.example.com",
    fetch: peer.fetch,
    webSocket: peer.webSocket,
  }).db("todos", Todos);

describe("useBasis", () => {
  test("a live view reads session.t, then follows { op: tx } without /info per tick", async () => {
    const state = { t: 7 };
    const peer = basisPeer(state);
    const box = capture<number | undefined>();

    const { container } = render(BasisWatching, {
      props: { db: dbOver(peer), report: box.report },
    });
    expect(box.last()).toBeUndefined();

    await waitFor(() => expect(box.last()).toBe(7));
    expect(container.querySelector(".basis")!.textContent).toBe("7");
    const infos = infoCalls(peer.calls).length;

    state.t = 9;
    peer.push({ op: "tx", t: 9, datoms: [] });
    await waitFor(() => expect(box.last()).toBe(9));
    expect(container.querySelector(".basis")!.textContent).toBe("9");
    expect(infoCalls(peer.calls).length).toBe(infos);
  });

  test("an asOf view answers its t on the first render, with no request", () => {
    const peer = fakePeer();
    const box = capture<number | undefined>();
    const props = { db: dbOver(peer), t: 3, report: box.report };

    const { rerender } = render(BasisSwitching, { props });
    expect(box.last()).toBe(3);

    rerender({ props });
    expect(box.last()).toBe(3);
    expect(peer.calls).toHaveLength(0);
    expect(peer.frames).toHaveLength(0);
  });

  test("switching views re-answers — pinned coordinates still without a request", async () => {
    const state = { t: 7 };
    const peer = basisPeer(state);
    const db = dbOver(peer);
    const box = capture<number | undefined>();
    const props = (t: number | undefined) => ({ db, t, report: box.report });

    const { rerender } = render(BasisSwitching, { props: props(3) });
    expect(box.last()).toBe(3);

    rerender({ props: props(5) });
    await waitFor(() => expect(box.last()).toBe(5));
    expect(peer.calls).toHaveLength(0);

    rerender({ props: props(undefined) });
    await waitFor(() => expect(box.last()).toBe(7));
  });
});
