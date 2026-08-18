import * as Effect from "effect/Effect";
import { useState } from "react";
import { db } from "./db.ts";
import { addTodo, deleteTodo, setDone, todoQuery, type TodoRow } from "./todos.ts";
import { useLive } from "./useLive.ts";

// hoisted, so the hook's dependency is stable across renders
const todos = db.live(todoQuery);

export const App = () => (
  <main>
    <h1>todos</h1>
    <NewTodo />
    <TodoList />
  </main>
);

const TodoList = () => {
  const { rows, error } = useLive(todos);
  if (error !== undefined) return <p>offline…</p>;
  if (rows === undefined) return <p>loading…</p>;
  return (
    <ul>
      {rows.map((row) => (
        <TodoRowView key={row.id} row={row} />
      ))}
    </ul>
  );
};

const TodoRowView = ({ row }: { row: TodoRow }) => (
  <li>
    <label>
      <input
        type="checkbox"
        checked={row.done}
        onChange={(e) =>
          void Effect.runPromise(setDone(db, { id: row.id }, e.target.checked))
        }
      />
      <span style={{ textDecoration: row.done ? "line-through" : undefined }}>
        {row.title}
      </span>
    </label>
    <button
      type="button"
      onClick={() => void Effect.runPromise(deleteTodo(db, { id: row.id }))}
    >
      delete
    </button>
  </li>
);

const NewTodo = () => {
  const [title, setTitle] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const value = title.trim();
        if (value === "") return;
        setTitle("");
        void Effect.runPromise(addTodo(db, value));
      }}
    >
      <input
        value={title}
        placeholder="what needs doing?"
        onChange={(e) => setTitle(e.target.value)}
      />
      <button type="submit">add</button>
    </form>
  );
};
