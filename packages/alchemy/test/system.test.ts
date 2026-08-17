/**
 * The resource itself: identity, the name rule its clients enforce, peer
 * resolution, and the env keys the Binding/Http layers agree on.
 *
 * Instantiating a resource (`Ripple.System("Sys", …)`) needs a running
 * engine — that lives in `stack.test.ts`. What is checkable in isolation is
 * everything the provider decides *about* a system, plus the shape of the
 * props and attributes, which the compiler checks.
 */

import { describe, expect, test } from "bun:test";
import * as Redacted from "effect/Redacted";
import { ReadSystem } from "../src/ReadSystem.ts";
import { ReadWriteSystem } from "../src/ReadWriteSystem.ts";
import {
  AUTH_ENV_KEYS,
  authEnv,
  DATABASE_NAME_RE,
  DEFAULT_JWT_MAX_TTL,
  internalSecret,
  isSystem,
  resolvePeer,
  System,
  type SystemProps,
} from "../src/System.ts";
import { SERVICE_ORIGIN } from "../src/SystemBinding.ts";
import { envKeys } from "../src/SystemRuntime.ts";
import { WriteSystem } from "../src/WriteSystem.ts";

describe("identity", () => {
  test("the resource class carries its type", () => {
    expect(System.Type).toBe("Ripple.System");
  });

  test("isSystem recognises a system and nothing else", () => {
    expect(isSystem({ Type: "Ripple.System", FQN: "app/Sys" })).toBe(true);
    // Refs resolve to callable proxies, hence the `function` case.
    const ref = Object.assign(() => {}, { Type: "Ripple.System" });
    expect(isSystem(ref)).toBe(true);
    expect(isSystem({ Type: "Cloudflare.KV.Namespace", FQN: "app/KV" })).toBe(false);
    // the resource this replaced is not this resource
    expect(isSystem({ Type: "Ripple.Database", FQN: "app/Movies" })).toBe(false);
    expect(isSystem(undefined)).toBe(false);
    expect(isSystem("Ripple.System")).toBe(false);
  });

  test("the capabilities are keyed under stable ids", () => {
    expect(ReadSystem.key).toBe("Ripple.ReadSystem");
    expect(WriteSystem.key).toBe("Ripple.WriteSystem");
    expect(ReadWriteSystem.key).toBe("Ripple.ReadWriteSystem");
  });
});

/**
 * A system pins no database name — that is the whole point of the resource.
 * Both halves of that are compile-time facts, so the assertions below are
 * type-level; the `expect`s only keep the test runner honest about having run
 * the file.
 */
describe("a system has no database name", () => {
  test("`name` is not a prop", () => {
    // @ts-expect-error a database name is chosen at runtime, by `create(name)`
    const props: SystemProps = { peer: "https://peer.example.com", name: "movies" };
    expect(props.peer).toBe("https://peer.example.com");

    type NameIsAProp = "name" extends keyof SystemProps ? true : false;
    const nameIsAProp: NameIsAProp = false;
    expect(nameIsAProp).toBe(false);
  });

  test("the attributes are url / peerName / token — no name, no databaseUrl", () => {
    const attributes: System["Attributes"] = {
      url: "https://peer.example.com",
      peerName: "ripple-peer",
      token: undefined,
    };
    expect(Object.keys(attributes).sort()).toEqual(["peerName", "token", "url"]);

    type Attr = keyof System["Attributes"];
    const hasName: "name" extends Attr ? true : false = false;
    const hasDatabaseUrl: "databaseUrl" extends Attr ? true : false = false;
    expect([hasName, hasDatabaseUrl]).toEqual([false, false]);
  });
});

describe("database names", () => {
  test("the regex is the peer Worker's `validDbName`", () => {
    for (const ok of ["a", "movies", "A0", "a.b-c_d", "x".repeat(64)]) {
      expect(DATABASE_NAME_RE.test(ok)).toBe(true);
    }
    for (const bad of ["", "-leading", ".leading", "has space", "has/slash", "x".repeat(65)]) {
      expect(DATABASE_NAME_RE.test(bad)).toBe(false);
    }
  });
});

describe("peer resolution", () => {
  test("a Worker-shaped peer yields its url and script name", () => {
    expect(resolvePeer({ url: "https://peer.example.com", workerName: "ripple-peer" })).toEqual({
      url: "https://peer.example.com",
      workerName: "ripple-peer",
    });
  });

  test("a bare URL has no script name — no service binding is possible", () => {
    expect(resolvePeer("https://peer.example.com")).toEqual({
      url: "https://peer.example.com",
      workerName: "",
    });
  });

  test("an undeployed Worker has no url yet", () => {
    expect(resolvePeer({ url: undefined }).url).toBeUndefined();
  });
});

describe("env keys", () => {
  test("the env keys are derived from the logical id — and there is no _DB key", () => {
    const keys = envKeys({ LogicalId: "Sys" });
    expect(keys).toEqual({
      service: "Sys",
      url: "Sys_URL",
      token: "Sys_TOKEN",
    });
    expect(Object.values(keys)).not.toContain("Sys_DB");
  });

  test("service-binding dispatch uses a synthetic origin", () => {
    expect(SERVICE_ORIGIN).toBe("https://ripple.internal");
  });
});

/**
 * The peer declares its own auth env; `authEnv` only names the keys it reads.
 * The peer Worker must agree on these exact strings.
 */
describe("the peer's auth env", () => {
  test("the key names are the ones the peer Worker reads", () => {
    expect(AUTH_ENV_KEYS).toEqual({
      policy: "RIPPLE_POLICY",
      jwksUrl: "RIPPLE_JWKS_URL",
      issuers: "RIPPLE_JWT_ISS",
      aud: "RIPPLE_JWT_AUD",
      maxTtl: "RIPPLE_JWT_MAX_TTL",
      allowedOrigins: "RIPPLE_ALLOWED_ORIGINS",
      internalSecret: "RIPPLE_INTERNAL_SECRET",
    });
    expect(DEFAULT_JWT_MAX_TTL).toBe(900);
  });

  test("nothing configured binds nothing — today's peer, byte for byte", () => {
    expect(authEnv(undefined)).toEqual({});
    expect(authEnv({})).toEqual({});
    expect(authEnv({ policy: "" })).toEqual({});
  });

  test("issuers and origins are comma-separated sets, from a list or a string", () => {
    const { [AUTH_ENV_KEYS.internalSecret]: _secret, ...env } = authEnv({
      policy: '{"v":1}',
      jwksUrl: "https://auth.acme.example/.well-known/jwks.json",
      issuers: ["https://auth.acme.example", " https://auth.other.example "],
      aud: "ripple:peer:prod",
      maxTtl: 300,
      allowedOrigins: "https://app.acme.example, ",
    });
    expect(env).toEqual({
      RIPPLE_POLICY: '{"v":1}',
      RIPPLE_JWKS_URL: "https://auth.acme.example/.well-known/jwks.json",
      RIPPLE_JWT_ISS: "https://auth.acme.example,https://auth.other.example",
      RIPPLE_JWT_AUD: "ripple:peer:prod",
      RIPPLE_JWT_MAX_TTL: "300",
      RIPPLE_ALLOWED_ORIGINS: "https://app.acme.example",
    });
  });

  test("the Worker→DO secret stays Redacted, so it lands as a secret binding", () => {
    const env = authEnv({ internalSecret: "sh4red" });
    const bound = env[AUTH_ENV_KEYS.internalSecret];
    expect(Redacted.isRedacted(bound)).toBe(true);
    expect(Redacted.value(bound as Redacted.Redacted<string>)).toBe("sh4red");
  });

  /**
   * The DO gate is off when `RIPPLE_INTERNAL_SECRET` is unset, so a policy that
   * bound no secret would arm enforcement on the Worker while leaving the
   * transactor trusting whatever principal the Worker claims.
   */
  test("a policy always binds an internal secret, minting one if none was pinned", () => {
    const env = authEnv({
      policy: '{"v":1}',
      jwksUrl: "https://auth.acme.example/.well-known/jwks.json",
      issuers: "https://auth.acme.example",
      aud: "ripple:peer:prod",
    });
    const bound = env[AUTH_ENV_KEYS.internalSecret];
    expect(Redacted.isRedacted(bound)).toBe(true);
    const minted = Redacted.value(bound as Redacted.Redacted<string>);
    expect(minted).not.toBe("");
    expect(minted).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a policy with a pinned secret uses that secret, not a fresh one", () => {
    const env = authEnv({
      policy: '{"v":1}',
      jwksUrl: "https://auth.acme.example/.well-known/jwks.json",
      issuers: "https://auth.acme.example",
      aud: "ripple:peer:prod",
      internalSecret: "sh4red",
    });
    expect(Redacted.value(env[AUTH_ENV_KEYS.internalSecret] as Redacted.Redacted<string>)).toBe(
      "sh4red",
    );
  });

  test("no policy and no pinned secret binds no internal secret", () => {
    expect(authEnv({ jwksUrl: "https://auth.acme.example/.well-known/jwks.json" })).toEqual({
      RIPPLE_JWKS_URL: "https://auth.acme.example/.well-known/jwks.json",
    });
    expect(authEnv({})[AUTH_ENV_KEYS.internalSecret]).toBeUndefined();
    expect(authEnv({ policy: "" })[AUTH_ENV_KEYS.internalSecret]).toBeUndefined();
  });

  test("an unpinned internal secret is minted, and is not the same twice", () => {
    const a = Redacted.value(internalSecret());
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(Redacted.value(internalSecret()));
    // a pinned one is passed through, whichever wrapper it arrives in
    expect(Redacted.value(internalSecret("pinned"))).toBe("pinned");
    expect(Redacted.value(internalSecret(Redacted.make("pinned")))).toBe("pinned");
  });

  test("`auth` is a prop, but the system's attributes are unchanged", () => {
    const props: SystemProps = { peer: "https://peer.example.com", auth: { policy: "{}" } };
    expect(props.auth?.policy).toBe("{}");
    type HasAuth = "auth" extends keyof System["Attributes"] ? true : false;
    const hasAuth: HasAuth = false;
    expect(hasAuth).toBe(false);
  });
});
