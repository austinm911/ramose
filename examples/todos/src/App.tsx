import { useState } from "react";
import { db, run } from "./db.ts";
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
  const byAge = [...rows].sort(
    (a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime(),
  );
  return (
    <ul>
      {byAge.map((row) => (
        <TodoRowView key={row[0].id} row={row} />
      ))}
    </ul>
  );
};

const TodoRowView = ({ row: [eid, todo] }: { row: TodoRow }) => (
  <li>
    <label>
      <input
        type="checkbox"
        checked={todo.done}
        onChange={(e) => void run(setDone(db, eid, e.target.checked))}
      />
      <span style={{ textDecoration: todo.done ? "line-through" : undefined }}>
        {todo.title}
      </span>
    </label>
    <button type="button" onClick={() => void run(deleteTodo(db, eid))}>
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
