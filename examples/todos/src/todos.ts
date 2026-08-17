/** The app's queries and writes, in one place so the test can drive them. */

import type { Db, Eid, Pull, QueryBuilder } from "@ripple/alchemy/db";
import { Todo, type Todos } from "../schema.ts";

export type TodosDb = Db<typeof Todos>;
export type TodoEid = Eid<typeof Todos>;

export const pattern = {
  title: Todo.title,
  done: Todo.done,
  createdAt: Todo.createdAt,
};

/** One row: the entity, and the pattern's result for it. */
export type TodoRow = readonly [TodoEid, Pull<typeof Todos, typeof pattern>];

export const todoQuery = (q: QueryBuilder<typeof Todos>) =>
  q.where("?e", Todo.title, "_").find("?e").pull(pattern);

export const addTodo = (db: TodosDb, title: string) =>
  db.transact(function* (tx) {
    const t = yield* tx.entity();
    yield* t.add(Todo.title, title);
    yield* t.add(Todo.done, false);
    yield* t.add(Todo.createdAt, new Date());
  });

export const setDone = (db: TodosDb, eid: TodoEid, done: boolean) =>
  db.transact(function* (tx) {
    yield* tx.add(eid.id, Todo.done, done);
  });

export const deleteTodo = (db: TodosDb, eid: TodoEid) =>
  db.transact(function* (tx) {
    yield* tx.retractEntity(eid.id);
  });
