/**
 * The resource through the real engine: plan → apply → attributes, with an
 * in-memory state store and a local HTTP server standing in for the peer.
 *
 * No cloud, no credentials — `Ripple.providers()` talks to nothing but the
 * peer's `/health`, which is the point: the only thing the provider does at
 * deploy time is prove the peer is up.
 */

import { afterAll, describe, expect } from "bun:test";
import * as Alchemy from "alchemy";
import * as Test from "alchemy/Test/Bun";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { Database } from "../src/Database.ts";
import { providers } from "../src/Providers.ts";

/** A peer that is up, counting its health probes. */
let probes = 0;
const peer = Bun.serve({
  port: 0,
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      probes++;
      return Response.json({ ok: true, service: "ripple", stage: "test", time: Date.now() });
    }
    return new Response("not found", { status: 404 });
  },
});
const peerUrl = `http://127.0.0.1:${peer.port}`;

afterAll(() => peer.stop(true));

/** The planned action per resource, in FQN order. */
const actions = (plan: { resources: Record<string, { action: string }> }) =>
  Object.keys(plan.resources)
    .sort()
    .map((fqn) => plan.resources[fqn].action);

const { test } = Test.make({
  providers: providers(),
  state: Alchemy.inMemoryState(),
  stage: "test",
});

describe("Ripple.Database", () => {
  test.provider("resolves its name, urls and token", (stack) =>
    Effect.gen(function* () {
      const before = probes;
      const movies = yield* stack.deploy(
        Database("Movies", {
          peer: peerUrl,
          name: "movies",
          token: Redacted.make("s3cret"),
        }),
      );

      expect(movies.name).toBe("movies");
      expect(movies.url).toBe(peerUrl);
      expect(movies.databaseUrl).toBe(`${peerUrl}/db/movies`);
      expect(movies.peerName).toBe("");
      expect(Redacted.value(movies.token!)).toBe("s3cret");
      // the live provider proved the peer was up before anything bound to it
      expect(probes).toBeGreaterThan(before);

      yield* stack.destroy();
    }),
  );

  test.provider("takes the peer's url and script name from a Worker-shaped peer", (stack) =>
    Effect.gen(function* () {
      const movies = yield* stack.deploy(
        Database("Movies", {
          peer: { url: `${peerUrl}/`, workerName: "ripple-peer" },
          name: "movies",
        }),
      );
      expect(movies.url).toBe(peerUrl);
      expect(movies.peerName).toBe("ripple-peer");
      expect(movies.token).toBeUndefined();
      yield* stack.destroy();
    }),
  );

  test.provider("generates a legal database name when none is given", (stack) =>
    Effect.gen(function* () {
      const movies = yield* stack.deploy(
        Database("Movies", { peer: peerUrl, probe: false }),
      );
      // `${stack}-${id}-${stage}-${instance}`, lowercased, truncated to 64
      expect(movies.name).toMatch(/^[a-z0-9][a-z0-9._-]{0,63}$/);
      expect(movies.databaseUrl).toBe(`${peerUrl}/db/${movies.name}`);
      yield* stack.destroy();
    }),
  );

  test.provider("a redeploy with the same name is a no-op", (stack) =>
    Effect.gen(function* () {
      const props = { peer: peerUrl, name: "movies", probe: false } as const;
      yield* stack.deploy(Database("Movies", props));
      const plan = yield* stack.plan(Database("Movies", props));
      expect(actions(plan)).toEqual(["noop"]);
      yield* stack.destroy();
    }),
  );

  test.provider("renaming the database replaces it — a new name is a new database", (stack) =>
    Effect.gen(function* () {
      yield* stack.deploy(Database("Movies", { peer: peerUrl, name: "movies", probe: false }));
      const plan = yield* stack.plan(
        Database("Movies", { peer: peerUrl, name: "films", probe: false }),
      );
      expect(actions(plan)).toEqual(["replace"]);
      yield* stack.destroy();
    }),
  );

  test.provider("a peer that is down fails the deploy", (stack) =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        stack.deploy(
          Database("Movies", {
            // reserved TEST-NET-1 address: nothing answers, fast
            peer: "http://127.0.0.1:1",
            name: "movies",
            probe: { attempts: 2, delayMs: 1 },
          }),
        ),
      );
      expect(result._tag).toBe("Failure");
      yield* stack.destroy();
    }),
  );
});
