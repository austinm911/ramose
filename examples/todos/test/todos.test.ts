import { describe, expect, test } from "bun:test";
import { Session } from "@ripple/alchemy/schema";
import { Connection, fromJson, pull, query, toJson } from "@ripple/core";
import { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import { Todos } from "../schema.ts";
import { addTodo, deleteTodo, setDone, todoQuery } from "../src/todos.ts";

const run = <A, E>(effect: Effect.Effect<A, E, RuntimeContext>) =>
  Effect.runPromise(effect.pipe(Effect.provide(RuntimeContext.phantom)));

interface Frame {
  id?: number;
  op: string;
  [field: string]: unknown;
}

const inProcessPeer = async () => {
  const conn = await Connection.create();
  const sent: Frame[] = [];
  const listeners = new Map<string, ((ev: any) => void)[]>();
  const emit = (type: string, ev: unknown) => {
    for (const cb of listeners.get(type) ?? []) cb(ev);
  };
  const push = (frame: unknown) =>
    emit("message", { data: JSON.stringify(frame) });

  const answer = async (
    frame: Frame,
  ): Promise<{ status?: number; body: unknown }> => {
    const f = fromJson(frame) as Frame;
    switch (f.op) {
      case "transact": {
        const rep = await conn.transact(f.tx as never);
        return {
          body: {
            t: rep.t,
            txEid: rep.txEid,
            tempids: rep.tempids,
            datoms: rep.txData.length,
          },
        };
      }
      case "q": {
        const db = conn.db();
        const result = await query(
          db,
          f.query as object,
          (f.inputs as unknown[]) ?? [],
        );
        return { body: { t: db.effectiveT, root: db.effectiveT, result } };
      }
      case "pull": {
        const db = conn.db();
        return {
          body: {
            t: db.effectiveT,
            result: await pull(db, f.eid as number, f.pattern as never),
          },
        };
      }
      default:
        return { status: 404, body: { error: `no such op ${String(f.op)}` } };
    }
  };

  const socket = {
    send: (data: string) => {
      const frame = JSON.parse(data) as Frame;
      sent.push(frame);
      void answer(frame).then(
        (reply) => {
          push({ id: frame.id, status: reply.status ?? 200, body: toJson(reply.body) });
          if (frame.op === "transact") push({ op: "t", t: conn.t });
        },
        (cause: unknown) =>
          push({ id: frame.id, status: 500, body: { error: String(cause) } }),
      );
    },
    close: () => emit("close", {}),
    addEventListener: (type: string, cb: (ev: any) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), cb]);
    },
  };

  return { conn, sent, push, connect: () => socket };
};

const open = async () => {
  const peer = await inProcessPeer();
  const { session, db } = await run(
    Session.connect({
      url: "https://peer.local",
      name: "todos",
      catalog: Todos,
      connect: peer.connect,
    }),
  );
  return { peer, session, db };
};

const settle = () => Bun.sleep(30);

describe("the app's writes move the app's live store", () => {
  test("add / toggle / delete, with no refetch and no invalidation call", async () => {
    const { db, session } = await open();
    const todos = db.live(todoQuery);
    let notified = 0;
    todos.subscribe(() => {
      notified += 1;
    });

    expect(todos.get()).toBeUndefined();
    await settle();
    expect(todos.get()).toEqual([]);

    await run(addTodo(db, "write the spec"));
    await settle();
    const added = todos.get()!;
    expect(added.map((r) => r.title)).toEqual(["write the spec"]);
    expect(added[0].done).toBe(false);
    expect(added[0].createdAt).toBeInstanceOf(Date);
    expect(notified).toBeGreaterThan(0);
    expect(todos.error).toBeUndefined();

    await run(setDone(db, added[0].eid, true));
    await settle();
    expect(todos.get()!.map((r) => r.done)).toEqual([true]);
    expect(todos.get()!.map((r) => r.title)).toEqual(["write the spec"]);

    await run(setDone(db, added[0].eid, false));
    await settle();
    expect(todos.get()!.map((r) => r.done)).toEqual([false]);

    await run(addTodo(db, "ship it"));
    await settle();
    expect(todos.get()!.map((r) => r.title).sort()).toEqual([
      "ship it",
      "write the spec",
    ]);

    await run(deleteTodo(db, added[0].eid));
    await settle();
    expect(todos.get()!.map((r) => r.title)).toEqual(["ship it"]);

    session.close();
  });

  test("session.close() stops the store: no wake, no pass, snapshot stands", async () => {
    const { db, session, peer } = await open();
    const todos = db.live(todoQuery);
    await run(addTodo(db, "write the spec"));
    await settle();
    const last = todos.get();
    expect(last).toHaveLength(1);

    let notified = 0;
    todos.subscribe(() => {
      notified += 1;
    });
    session.close();

    // a write the store must never see: straight at the peer, then a `t` frame
    const frames = peer.sent.length;
    await peer.conn.transact([
      [":db/add", "tmp", ":todo/title", "invisible"],
      [":db/add", "tmp", ":todo/done", false],
      [":db/add", "tmp", ":todo/createdAt", new Date()],
    ]);
    peer.push({ op: "t", t: peer.conn.t });
    await settle();

    expect(notified).toBe(0);
    expect(peer.sent).toHaveLength(frames); // nothing more was asked
    expect(todos.get()).toBe(last); // same reference, for useSyncExternalStore

    // and the session itself is gone
    const failed = await run(
      addTodo(db, "too late").pipe(
        Effect.match({ onFailure: () => "failed", onSuccess: () => "wrote" }),
      ),
    );
    expect(failed).toBe("failed");
  });
});
