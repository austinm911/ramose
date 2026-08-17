/**
 * Runtime tests for the navigational query surface (issue #18 minimum slice).
 */

import { describe, expect, test } from "bun:test";
import {
  Connection,
  QueryError,
  QueryParseError,
  TxError,
  fromJson,
  normalizePullPattern,
  pull,
  query as coreQuery,
  toJson,
} from "@ripple/core";
import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Schema from "effect/Schema";
import {
  Attr,
  Catalog,
  Databases,
  Instant,
  Namespace,
  Ref,
  layer,
  lowerNavQuery,
  query,
} from "../../src/db/internal.ts";

const run = <A, E>(eff: Effect.Effect<A, E>) => Effect.runPromise(eff);

interface Reply {
  status: number;
  body: unknown;
}

const inProcessPeer = async () => {
  const conn = await Connection.create();

  const answer = async (op: string, body: any): Promise<Reply> => {
    try {
      if (op === "transact") {
        const rep = await conn.transact(body.tx);
        return {
          status: 200,
          body: {
            t: rep.t,
            txEid: rep.txEid,
            tempids: rep.tempids,
            datoms: rep.txData.length,
          },
        };
      }
      if (op === "q") {
        const db = conn.db();
        const result = await coreQuery(db, body.query, body.inputs ?? []);
        return {
          status: 200,
          body: { t: db.effectiveT, root: db.effectiveT, result },
        };
      }
      if (op === "pull") {
        const db = conn.db();
        const pattern = normalizePullPattern(body.pattern);
        const eid =
          typeof body.eid === "number" ? body.eid : await db.entid(body.eid);
        if (eid === undefined) {
          return { status: 200, body: { t: db.effectiveT, result: null } };
        }
        return {
          status: 200,
          body: { t: db.effectiveT, result: await pull(db, eid, pattern) },
        };
      }
      return { status: 404, body: { error: `no such op ${op}` } };
    } catch (err) {
      if (err instanceof TxError) {
        return {
          status: 409,
          body: { error: err.message, tag: "TxRejected", code: err.code },
        };
      }
      if (err instanceof QueryParseError || err instanceof QueryError) {
        return { status: 400, body: { error: err.message } };
      }
      return {
        status: 500,
        body: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  };

  const fetchImpl = (async (url: string, init: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const body =
      init.body === undefined ? {} : fromJson(JSON.parse(String(init.body)));
    const op = path.endsWith("/transact")
      ? "transact"
      : path.endsWith("/query")
        ? "q"
        : "pull";
    const reply = await answer(op, body);
    return new Response(JSON.stringify(toJson(reply.body)), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;

  function WebSocketImpl(this: unknown, _url: string) {
    const listeners = new Map<string, ((ev: any) => void)[]>();
    const emit = (type: string, ev: unknown) => {
      for (const cb of listeners.get(type) ?? []) cb(ev);
    };
    const socket = {
      readyState: 0,
      addEventListener: (type: string, cb: (ev: any) => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), cb]);
      },
      send: (data: string) => {
        const frame = fromJson(JSON.parse(data)) as any;
        void answer(frame.op, frame).then((reply) =>
          emit("message", {
            data: JSON.stringify({
              id: frame.id,
              status: reply.status,
              body: toJson(reply.body),
            }),
          }),
        );
      },
      close: () => emit("close", {}),
    };
    queueMicrotask(() => emit("open", {}));
    return socket;
  }

  const runtime = ManagedRuntime.make(
    layer({
      url: "https://peer.local",
      fetch: fetchImpl,
      webSocket: WebSocketImpl as unknown as typeof WebSocket,
    }),
  );

  return {
    ripple: runtime.runSync(Databases),
    dispose: () => runtime.dispose(),
  };
};

const User = Namespace("user", {
  name: Attr(Schema.String),
  friends: Attr(Ref.self, { cardinality: "many" }),
});

const Todo = Namespace("todo", {
  title: Attr(Schema.String),
  done: Attr(Schema.Boolean),
  due: Attr(Instant),
  owner: Attr(Ref(() => User)),
});

const Todos = Catalog({ user: User, todo: Todo });

describe("nav query", () => {
  test("Todo.owner.name path + lowerer", () => {
    const q = query(Todo)
      .where(Todo.done.eq(false), Todo.owner.name.startsWith("A"))
      .select({
        title: Todo.title,
        owner: Todo.owner.select({ name: User.name }),
      })
      .orderBy(Todo.due, "asc", { empty: "last" })
      .limit(20);

    const pred = Todo.owner.name.startsWith("A");
    expect(pred.path).toEqual([":todo/owner", ":user/name"]);
    expect(pred.op).toBe("startsWith");
    expect(pred.value).toBe("A");

    const lowered = lowerNavQuery(q.build());
    expect(Array.isArray(lowered.query.find[0])).toBe(true);
    expect((lowered.query.find[0] as unknown[])[0]).toBe("pull");
    expect(lowered.pullMap).toBeDefined();
    expect(
      lowered.query.where.some((c) => Array.isArray(c) && c[0] === "or"),
    ).toBe(true);
  });

  test("db.q navigational find-pull end to end", async () => {
    const peer = await inProcessPeer();
    const db = peer.ripple.db("todos", Todos);

    await run(db.install());
    await run(
      db.transact(function* (tx) {
        const alice = yield* tx.entity();
        yield* alice.add(User.name, "Alice");
        const bob = yield* tx.entity();
        yield* bob.add(User.name, "Bob");
        const t1 = yield* tx.entity();
        yield* t1.add(Todo.title, "ship");
        yield* t1.add(Todo.done, false);
        yield* t1.add(Todo.owner, alice.eid as never);
        yield* t1.add(Todo.due, new Date("2026-01-02"));
        const t2 = yield* tx.entity();
        yield* t2.add(Todo.title, "done already");
        yield* t2.add(Todo.done, true);
        yield* t2.add(Todo.owner, bob.eid as never);
        const t3 = yield* tx.entity();
        yield* t3.add(Todo.title, "also open");
        yield* t3.add(Todo.done, false);
        yield* t3.add(Todo.owner, bob.eid as never);
        yield* t3.add(Todo.due, new Date("2026-01-01"));
      }),
    );

    const openTodos = query(Todo)
      .where(Todo.done.eq(false))
      .orderBy(Todo.due, "asc", { empty: "last" })
      .select({
        title: Todo.title,
        due: Todo.due.optional,
        owner: Todo.owner.select({ name: User.name }),
      })
      .limit(20);

    const rows = await run(db.q(openTodos));
    expect(rows.map((r) => r.title)).toEqual(["also open", "ship"]);
    expect(rows[0]?.owner).toEqual({ name: "Bob" });
    expect(rows[1]?.owner).toEqual({ name: "Alice" });

    const aliceOnly = await run(
      db.q(
        query(Todo)
          .where(Todo.done.eq(false), Todo.owner.name.startsWith("A"))
          .select({ title: Todo.title }),
      ),
    );
    expect(aliceOnly).toEqual([{ title: "ship" }]);

    await peer.dispose();
  });
});
