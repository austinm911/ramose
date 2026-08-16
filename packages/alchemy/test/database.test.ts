/**
 * The resource itself: identity, name rules, peer resolution, and the env
 * keys the Binding/Http layers agree on.
 *
 * Instantiating a resource (`Ripple.Database("Movies", …)`) needs a running
 * engine — that lives in `stack.test.ts`. What is checkable in isolation is
 * everything the provider decides *about* a database.
 */

import { describe, expect, test } from "bun:test";
import {
  Database,
  DATABASE_NAME_RE,
  databaseUrl,
  isDatabase,
  resolvePeer,
} from "../src/Database.ts";
import { sanitizeDatabaseName } from "../src/Database.ts";
import { envKeys } from "../src/DatabaseRuntime.ts";
import { SERVICE_ORIGIN } from "../src/DatabaseBinding.ts";
import { ReadDatabase } from "../src/ReadDatabase.ts";
import { ReadWriteDatabase } from "../src/ReadWriteDatabase.ts";
import { WriteDatabase } from "../src/WriteDatabase.ts";

describe("identity", () => {
  test("the resource class carries its type", () => {
    expect(Database.Type).toBe("Ripple.Database");
  });

  test("isDatabase recognises a database and nothing else", () => {
    expect(isDatabase({ Type: "Ripple.Database", FQN: "app/Movies" })).toBe(true);
    // Refs resolve to callable proxies, hence the `function` case.
    const ref = Object.assign(() => {}, { Type: "Ripple.Database" });
    expect(isDatabase(ref)).toBe(true);
    expect(isDatabase({ Type: "Cloudflare.KV.Namespace", FQN: "app/KV" })).toBe(false);
    expect(isDatabase(undefined)).toBe(false);
    expect(isDatabase("Ripple.Database")).toBe(false);
  });

  test("the capabilities are keyed under stable ids", () => {
    expect(ReadDatabase.key).toBe("Ripple.ReadDatabase");
    expect(WriteDatabase.key).toBe("Ripple.WriteDatabase");
    expect(ReadWriteDatabase.key).toBe("Ripple.ReadWriteDatabase");
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

  test("a generated physical name is coerced into a legal one", () => {
    // createPhysicalName emits `${stack}-${id}-${stage}-${suffix}`.
    const generated = sanitizeDatabaseName("ripple-Movies-dev-ABC123");
    expect(generated).toBe("ripple-movies-dev-abc123");
    expect(DATABASE_NAME_RE.test(generated)).toBe(true);
  });

  test("sanitizing strips illegal leading characters and over-long tails", () => {
    expect(sanitizeDatabaseName("--weird$name")).toBe("weird-name");
    expect(sanitizeDatabaseName("a b/c")).toBe("a-b-c");
    const long = sanitizeDatabaseName("m".repeat(200));
    expect(long.length).toBe(64);
    expect(DATABASE_NAME_RE.test(long)).toBe(true);
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

describe("urls and env keys", () => {
  test("databaseUrl is the /db/:name prefix, with a trimmed base", () => {
    expect(databaseUrl("https://peer.example.com/", "movies")).toBe(
      "https://peer.example.com/db/movies",
    );
    expect(databaseUrl("https://peer.example.com", "a b")).toBe(
      "https://peer.example.com/db/a%20b",
    );
  });

  test("the env keys are derived from the logical id", () => {
    expect(envKeys({ LogicalId: "Movies" })).toEqual({
      service: "Movies",
      url: "Movies_URL",
      name: "Movies_DB",
      token: "Movies_TOKEN",
    });
  });

  test("service-binding dispatch uses a synthetic origin", () => {
    expect(SERVICE_ORIGIN).toBe("https://ripple.internal");
  });
});
