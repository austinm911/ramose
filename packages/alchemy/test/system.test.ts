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
import { ReadSystem } from "../src/ReadSystem.ts";
import { ReadWriteSystem } from "../src/ReadWriteSystem.ts";
import {
  DATABASE_NAME_RE,
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
