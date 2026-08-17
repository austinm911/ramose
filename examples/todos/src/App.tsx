/** One screen: input, list, checkbox, delete. The only `useState` is the input. */

import { useState } from "react";
import { db, run } from "./db.ts";
import { addTodo, deleteTodo, setDone, todoQuery } from "./todos.ts";
import { useLive } from "./useLive.ts";

/** The tab's store. This session's `ack.t` wakes it; nothing else does. */
const todos = db.live(todoQuery);

type Row = NonNullable<ReturnType<typeof todos.get>>[number];

export const App = () => (
  <main>
    <h1>todos</h1>
    <NewTodo />
    <TodoList />
  </main>
);

const TodoList = () => {
  const rows = useLive(todos);
  if (rows === undefined) return <p>loading…</p>;
  const byAge = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  return (
    <ul>
      {byAge.map((row) => (
        <TodoRow key={row.eid.id} row={row} />
      ))}
    </ul>
  );
};

const TodoRow = ({ row }: { row: Row }) => (
  <li>
    <label>
      <input
        type="checkbox"
        checked={row.done}
        onChange={(e) => void run(setDone(db, row.eid, e.target.checked))}
      />
      <span style={{ textDecoration: row.done ? "line-through" : undefined }}>
        {row.title}
      </span>
    </label>
    <button type="button" onClick={() => void run(deleteTodo(db, row.eid))}>
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
        void run(addTodo(db, value));
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
