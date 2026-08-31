/**
 * The provider contract under the ported binding:
 *
 * - `useRamose` outside a provider throws, and the message says what to do.
 * - `useRamose` inside returns the exact client object that was passed in.
 * - `useDb` returns the client's interned root handle — same object across
 *   re-renders and across sibling components.
 * - Swapping the `client` prop moves the tree to the new client and handle.
 * - A terminal client throws from `useDb` into the component.
 * - Unmounting the provider leaves the client usable: the provider never owned
 *   its lifetime.
 */

import { render } from "@octanejs/testing-library";
import { ClientClosedError, type Client, type ClientDatabase } from "ramose/client";
import { describe, expect, test } from "vitest";
import {
  BareRamose,
  ProvidedBoth,
  ProvidedClient,
  ProvidedDb,
  ProvidedSiblingDbs,
} from "../fixtures/provider.tsrx";
import { capture, todoWorld } from "../support/world.ts";

describe("useRamose", () => {
  test("outside a provider it throws, and the message names RamoseProvider", () => {
    expect(() => render(BareRamose)).toThrow(/RamoseProvider/);
    expect(() => render(BareRamose)).toThrow(/useRamose/);
    expect(() => render(BareRamose)).toThrow(/client=\{…\}/);
  });

  test("inside a provider it returns the exact client that was passed in", () => {
    const world = todoWorld();
    const box = capture<Client>();

    render(ProvidedClient, {
      props: { client: world.client, report: box.report },
    });

    expect(box.last()).toBe(world.client);
  });
});

describe("useDb", () => {
  test("returns the client's interned root handle across re-renders", () => {
    const world = todoWorld();
    const box = capture<ClientDatabase>();
    const props = { client: world.client, report: box.report };

    const { rerender } = render(ProvidedDb, { props });
    expect(box.last()).toBe(world.db);

    rerender({ props });
    rerender({ props });

    expect(box.renders.length).toBeGreaterThan(1);
    expect(box.renders.every((db) => db === world.db)).toBe(true);
  });

  test("returns the same handle from sibling components", () => {
    const world = todoWorld();
    const left = capture<ClientDatabase>();
    const right = capture<ClientDatabase>();

    render(ProvidedSiblingDbs, {
      props: {
        client: world.client,
        reportLeft: left.report,
        reportRight: right.report,
      },
    });

    expect(left.last()).toBe(world.db);
    expect(right.last()).toBe(world.db);
    expect(left.last()).toBe(right.last());
  });

  test("a terminal client throws ClientClosedError into the component", () => {
    const world = todoWorld();
    const box = capture<ClientDatabase>();
    const props = { client: world.client, report: box.report };

    const { rerender } = render(ProvidedDb, { props });
    expect(box.last()).toBe(world.db);

    world.close();
    expect(() => rerender({ props })).toThrow(ClientClosedError);
  });
});

describe("RamoseProvider", () => {
  test("swapping the client prop moves the tree to the new client", () => {
    const first = todoWorld();
    const second = todoWorld();
    const clients = capture<Client>();
    const dbs = capture<ClientDatabase>();

    const { rerender } = render(ProvidedBoth, {
      props: {
        client: first.client,
        reportClient: clients.report,
        reportDb: dbs.report,
      },
    });

    expect(clients.last()).toBe(first.client);
    expect(dbs.last()).toBe(first.db);

    rerender({
      props: {
        client: second.client,
        reportClient: clients.report,
        reportDb: dbs.report,
      },
    });

    expect(clients.last()).toBe(second.client);
    expect(dbs.last()).toBe(second.db);
    expect(clients.last()).not.toBe(first.client);
    expect(dbs.last()).not.toBe(first.db);
  });

  test("unmounting the provider leaves the client usable", () => {
    const world = todoWorld();
    const box = capture<ClientDatabase>();

    const { unmount } = render(ProvidedDb, {
      props: { client: world.client, report: box.report },
    });
    expect(box.last()).toBe(world.db);

    unmount();

    expect(world.client.open()).toBe(world.db);
  });
});
