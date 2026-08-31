/**
 * The `useSyncState` contract — where the session is, as component state:
 *
 * - with no argument it reads the provider's client, and re-renders on every
 *   transition: `live` → `stale` → `offline` are all still readable, and the
 *   non-retryable ones (`authentication-required`, `closed`) arrive the same
 *   way, with nothing special for a renderer to do to receive them;
 * - an explicit `Client` and an explicit `ClientDatabase` each read *their own*
 *   session. Moving one and not the other is the only assertion that can catch
 *   the two being wired to the same store;
 * - an explicit source needs no provider at all;
 * - neither a provider nor a source is a wiring mistake, and the message says
 *   which of the two fixes it.
 *
 * Octane's `act` is always async, so every transition is awaited.
 */

import { act, render } from "@octanejs/testing-library";
import type { SyncState } from "ramose/client";
import { describe, expect, test } from "vitest";
import { ProvidedSync, SyncProbe, SyncSources } from "../fixtures/writes.tsrx";
import { capture, todoWorld } from "../support/world.ts";

const statusOf = (container: HTMLElement, name: string) =>
  container
    .querySelector(`[data-name="${name}"]`)!
    .getAttribute("data-status");

describe("useSyncState", () => {
  test("it reports the provider's client and re-renders on every transition", async () => {
    const world = todoWorld("live");
    const box = capture<SyncState>();
    const { container } = render(ProvidedSync, {
      props: { client: world.client, report: box.report },
    });
    expect(box.last().status).toBe("live");
    expect(statusOf(container, "provider")).toBe("live");

    // still readable: a renderer must not blank the screen for either of these
    await act(() => {
      world.clientSync("stale");
    });
    expect(box.last().status).toBe("stale");

    await act(() => {
      world.clientSync("offline");
    });
    expect(box.last().status).toBe("offline");
    expect(statusOf(container, "provider")).toBe("offline");

    // and back: `offline` is not terminal
    await act(() => {
      world.clientSync("live");
    });
    expect(box.last().status).toBe("live");

    expect(box.renders.map((state) => state.status)).toEqual([
      "live",
      "stale",
      "offline",
      "live",
    ]);
  });

  test("a non-retryable status arrives like any other", async () => {
    const world = todoWorld("live");
    const box = capture<SyncState>();
    const { container } = render(ProvidedSync, {
      props: { client: world.client, report: box.report },
    });

    // the credential was refused: nothing this component does clears it
    await act(() => {
      world.clientSync("authentication-required");
    });
    expect(box.last().status).toBe("authentication-required");
    expect(statusOf(container, "provider")).toBe("authentication-required");

    // and a client made terminal reports it, rather than going quiet
    await act(() => {
      world.close();
    });
    expect(box.last().status).toBe("closed");
    expect(statusOf(container, "provider")).toBe("closed");
  });

  test("an explicit client and an explicit database read their own sessions", async () => {
    const world = todoWorld("live");
    const provider = capture<SyncState>();
    const client = capture<SyncState>();
    const database = capture<SyncState>();
    const { container } = render(SyncSources, {
      props: {
        client: world.client,
        db: world.db,
        fromProvider: provider.report,
        fromClient: client.report,
        fromDatabase: database.report,
      },
    });
    expect(provider.last().status).toBe("live");
    expect(client.last().status).toBe("live");
    expect(database.last().status).toBe("live");

    // move only the database's session
    await act(() => {
      world.databaseSync("stale");
    });
    expect(database.last().status).toBe("stale");
    expect(statusOf(container, "database")).toBe("stale");
    expect(provider.last().status).toBe("live"); // untouched
    expect(client.last().status).toBe("live");
    expect(statusOf(container, "client")).toBe("live");

    // move only the client's; the database keeps the state it was left in
    await act(() => {
      world.clientSync("offline");
    });
    expect(provider.last().status).toBe("offline");
    expect(client.last().status).toBe("offline");
    expect(statusOf(container, "provider")).toBe("offline");
    expect(database.last().status).toBe("stale");

    // and both together
    await act(() => {
      world.sync("live");
    });
    expect(provider.last().status).toBe("live");
    expect(client.last().status).toBe("live");
    expect(database.last().status).toBe("live");
  });

  test("an explicit source needs no provider", async () => {
    const world = todoWorld("live");
    const box = capture<SyncState>();
    render(SyncProbe, {
      props: { source: world.client, report: box.report },
    });
    expect(box.last().status).toBe("live");

    await act(() => {
      world.clientSync("stale");
    });
    expect(box.last().status).toBe("stale");
  });

  test("no provider and no source is a wiring error, and the message says how to fix it", () => {
    const box = capture<SyncState>();
    const props = { props: { report: box.report } };
    expect(() => render(SyncProbe, props)).toThrow(/useSyncState/);
    expect(() => render(SyncProbe, props)).toThrow(/RamoseProvider/);
  });
});
