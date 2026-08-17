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
import { providers } from "../src/Providers.ts";
import { System } from "../src/System.ts";

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

describe("Ripple.System", () => {
  test.provider("resolves the peer url and token — and pins no database name", (stack) =>
    Effect.gen(function* () {
      const before = probes;
      const sys = yield* stack.deploy(
        System("Sys", { peer: peerUrl, token: Redacted.make("s3cret") }),
      );

      expect(sys.url).toBe(peerUrl);
      expect(sys.peerName).toBe("");
      expect(Redacted.value(sys.token!)).toBe("s3cret");
      // a system is the peer, not a database: no name, no /db/:name prefix
      const attributes = Object.keys(sys);
      expect(attributes).toContain("url");
      expect(attributes).not.toContain("name");
      expect(attributes).not.toContain("databaseUrl");
      // the live provider proved the peer was up before anything bound to it
      expect(probes).toBeGreaterThan(before);

      yield* stack.destroy();
    }),
  );

  test.provider("takes the peer's url and script name from a Worker-shaped peer", (stack) =>
    Effect.gen(function* () {
      const sys = yield* stack.deploy(
        System("Sys", { peer: { url: `${peerUrl}/`, workerName: "ripple-peer" } }),
      );
      expect(sys.url).toBe(peerUrl);
      expect(sys.peerName).toBe("ripple-peer");
      expect(sys.token).toBeUndefined();
      yield* stack.destroy();
    }),
  );

  test.provider("a redeploy of the same peer is a no-op", (stack) =>
    Effect.gen(function* () {
      const props = { peer: peerUrl, probe: false } as const;
      yield* stack.deploy(System("Sys", props));
      const plan = yield* stack.plan(System("Sys", props));
      expect(actions(plan)).toEqual(["noop"]);
      yield* stack.destroy();
    }),
  );

  test.provider("a policy with no verifier configured fails the deploy, not the first read", (stack) =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        stack.deploy(
          System("Sys", { peer: peerUrl, probe: false, auth: { policy: '{"v":1}' } }),
        ),
      );
      expect(result._tag).toBe("Failure");

      // the same policy with a complete verifier deploys
      const sys = yield* stack.deploy(
        System("Sys", {
          peer: peerUrl,
          probe: false,
          auth: {
            policy: '{"v":1}',
            jwksUrl: "https://auth.acme.example/.well-known/jwks.json",
            issuers: "https://auth.acme.example",
            aud: "ripple:peer:test",
          },
        }),
      );
      expect(sys.url).toBe(peerUrl);
      yield* stack.destroy();
    }),
  );

  test.provider("a peer that is down fails the deploy", (stack) =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        stack.deploy(
          System("Sys", {
            // loopback port 1: nothing listens, so connect() refuses immediately
            peer: "http://127.0.0.1:1",
            probe: { attempts: 2, delayMs: 1 },
          }),
        ),
      );
      expect(result._tag).toBe("Failure");
      yield* stack.destroy();
    }),
  );
});
