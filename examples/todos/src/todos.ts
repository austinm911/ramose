import type {
  Eid,
  LiveQueryBuilder,
  TypedLiveDatabaseClient,
} from "@ripple/alchemy/db";
import { Todo, type Todos } from "../schema.ts";

export type TodosDb = TypedLiveDatabaseClient<typeof Todos>;
export type TodoEid = Eid<typeof Todos>;

export const todoQuery = (q: LiveQueryBuilder<typeof Todos>) =>
  q.where("?e", Todo.title, "_").find("?e").pull({
    title: Todo.title,
    done: Todo.done,
    createdAt: Todo.createdAt,
  });

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
