/**
 * The consumer proof: the app's own query and writes against a real
 * `@ripple/core` `Connection`, over the two wires the client actually uses —
 * writes as `POST /db/todos/transact`, reads and `t` ticks as session frames.
 *
 * What it pins is the loop the UI depends on: a write moves the live stream
 * with no refetch and no invalidation call of its own.
 */

import { describe, expect, test } from "bun:test";
import * as Ripple from "@ripple/alchemy/db";
import { Connection, fromJson, pull, query, toJson } from "@ripple/core";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Stream from "effect/Stream";
import { Todo, Todos } from "../schema.ts";
import {
  addTodo,
  deleteTodo,
  pullTodo,
  setDone,
  todoQuery,
  type TodoRow,
  type TodosDb,
} from "../src/todos.ts";

const settle = () => Bun.sleep(30);

/** One database, one `Connection`, both wires. */
const inProcessPeer = async () => {
  const conn = await Connection.create();
  const pushes: ((frame: unknown) => void)[] = [];

  const answer = async (op: string, body: any) => {
    if (op === "transact") {
      const rep = await conn.transact(body.tx);
      return { status: 200, body: { t: rep.t, txEid: rep.txEid, tempids: rep.tempids, datoms: rep.txData.length } };
    }
    const db = conn.db();
    if (op === "q") {
      return {
        status: 200,
        body: { t: db.effectiveT, root: db.effectiveT, result: await query(db, body.query, body.inputs ?? []) },
      };
    }
    return {
      status: 200,
      body: { t: db.effectiveT, result: await pull(db, body.eid as number, body.pattern) },
    };
  };

  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body = fromJson(JSON.parse(String(init.body))) as any;
    const reply = await answer("transact", body);
    // a write is basis movement every socket must hear about
    for (const push of pushes) push({ op: "t", t: conn.t });
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
    pushes.push((frame) => emit("message", { data: JSON.stringify(frame) }));
    const socket = {
      readyState: 0,
      addEventListener: (type: string, cb: (ev: any) => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), cb]);
      },
      send: (data: string) => {
        const frame = fromJson(JSON.parse(data)) as any;
        void answer(frame.op, frame).then((reply) =>
          emit("message", {
            data: JSON.stringify({ id: frame.id, status: reply.status, body: toJson(reply.body) }),
          }),
        );
      },
      close: () => emit("close", {}),
    };
    queueMicrotask(() => emit("open", {}));
    return socket;
  }

  const runtime = ManagedRuntime.make(
    Ripple.layer({
      url: "https://peer.local",
      fetch: fetchImpl,
      webSocket: WebSocketImpl as unknown as typeof WebSocket,
    }),
  );
  const db: TodosDb = runtime.runSync(Ripple.Databases).db("todos", Todos);
  await Effect.runPromise(db.install());
  return {
    conn,
    db,
    tick: () => {
      for (const push of pushes) push({ op: "t", t: conn.t });
    },
    dispose: () => runtime.dispose(),
  };
};

/** The example's own `useLive`, minus React. */
const live = (stream: Stream.Stream<readonly TodoRow[], Ripple.DbError>) => {
  let rows: readonly TodoRow[] | undefined;
  let error: unknown;
  let changes = 0;
  const fiber = Effect.runFork(
    Stream.runForEach(stream, (next) =>
      Effect.sync(() => {
        rows = next;
        changes += 1;
      }),
    ).pipe(
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          error = Cause.squash(cause);
        }),
      ),
    ),
  );
  return {
    get rows() {
      return rows;
    },
    get error() {
      return error;
    },
    get changes() {
      return changes;
    },
    stop: () => Effect.runPromise(Fiber.interrupt(fiber)),
  };
};

const titles = (rows: readonly TodoRow[] | undefined) =>
  (rows ?? []).map((r) => r[1].title);

describe("the app's writes move the app's live stream", () => {
  test("add / toggle / delete, with no refetch and no invalidation call", async () => {
    const peer = await inProcessPeer();
    const todos = live(peer.db.live(todoQuery));

    expect(todos.rows).toBeUndefined();
    await settle();
    expect(todos.rows).toEqual([]);

    await Effect.runPromise(addTodo(peer.db, "write the spec"));
    await settle();
    const added = todos.rows!;
    expect(titles(added)).toEqual(["write the spec"]);
    expect(added[0][1].done).toBe(false);
    expect(added[0][1].createdAt).toBeInstanceOf(Date);
    expect(todos.changes).toBeGreaterThan(1);
    expect(todos.error).toBeUndefined();

    const first = added[0][0];
    await Effect.runPromise(setDone(peer.db, first, true));
    await settle();
    expect(todos.rows!.map((r) => r[1].done)).toEqual([true]);
    expect(titles(todos.rows)).toEqual(["write the spec"]);

    await Effect.runPromise(setDone(peer.db, first, false));
    await settle();
    expect(todos.rows!.map((r) => r[1].done)).toEqual([false]);

    await Effect.runPromise(addTodo(peer.db, "ship it"));
    await settle();
    expect(titles(todos.rows).sort()).toEqual(["ship it", "write the spec"]);

    await Effect.runPromise(deleteTodo(peer.db, first));
    await settle();
    expect(titles(todos.rows)).toEqual(["ship it"]);

    await todos.stop();
    await peer.dispose();
  });

  test("a write by someone else arrives as a t frame and re-runs the query", async () => {
    const peer = await inProcessPeer();
    const todos = live(peer.db.live(todoQuery));
    await settle();
    expect(todos.rows).toEqual([]);

    // straight at the peer, then the tick the Worker's basis poller would send
    await peer.conn.transact([
      [":db/add", "tmp", ":todo/title", "from another tab"],
      [":db/add", "tmp", ":todo/done", false],
      [":db/add", "tmp", ":todo/createdAt", new Date()],
    ]);
    peer.tick();
    await settle();

    expect(titles(todos.rows)).toEqual(["from another tab"]);
    await todos.stop();
    await peer.dispose();
  });

  test("one row without a query: db.pull(eid, pattern)", async () => {
    const peer = await inProcessPeer();
    const report = await Effect.runPromise(addTodo(peer.db, "pull me"));

    // `dbAfter` is floored at the write, so this reads its own write
    const [[eid]] = await Effect.runPromise(
      report.dbAfter.q((q) => q.where("?e", Todo.title, "_").find("?e")),
    );
    const row = await Effect.runPromise(pullTodo(peer.db, eid));
    expect(row).toMatchObject({ title: "pull me", done: false });
    expect(row?.createdAt).toBeInstanceOf(Date);

    await peer.dispose();
  });

  test("interrupting the fiber is the whole teardown", async () => {
    const peer = await inProcessPeer();
    const todos = live(peer.db.live(todoQuery));
    await settle();
    const seen = todos.changes;

    await todos.stop();
    await Effect.runPromise(addTodo(peer.db, "invisible"));
    peer.tick();
    await settle();

    expect(todos.changes).toBe(seen);
    await peer.dispose();
  });
});
