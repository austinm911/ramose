# SPEC: reactive todo POC

A React todo app on `@ripple/alchemy` SchemaFx: a catalog, a generator transact, and a
**reactive subscription written in the existing pull syntax**. Writing a todo re-renders the
list — no refetch, no `useState` beside the `transact`, no invalidation call at the call site.
The write path itself notifies the live queries.

Everything is tagged _(exists today)_ or _(new for this POC)_; summary table in §8.

## 0. Goals, non-goals, and where things stand

**Goals** — one screen (input + list + checkbox + delete) against a real Ripple peer;
`transact(function* (tx) { … })` as the only write path; a subscription whose shape *is* an
`eid.pull` map; new surface kept to one ~120-line `live.ts` + one `useLive.ts` hook.

**Non-goals** — no new query/pull syntax, no client cache or view maintenance. The one engine
change in scope is threading `minT` through `pull` (§3) so a fenced refresh is fenced end to
end. No WebSocket/SSE fan-out (§4 says why it can't be the default today).

**Where things stand today** _(exists today)_ — the Alchemy resource *is* the peer; a database
is just a name and `create` is literally `connect`. A write client's `create` ensures the
catalog as one idempotent schema tx (a read client skips it); attrs resolve against the *basis*
schema, so ensure must land before first use. The transactor is a single writer with dense,
gap-free `t` and persist-before-ack. Novelty is server-side only, the public Worker is
HTTP-only, and the typed client has no subscribe API — so reactivity sits on `q` + `eid.pull` +
a fence, not on push.

## 1. Catalog — `examples/todos/schema.ts` _(new for this POC — file; the API exists today)_

```ts
import * as Schema from "effect/Schema";
import * as SchemaFx from "@ripple/alchemy/schema";

export const Todo = SchemaFx.Namespace("todo", {
  title: SchemaFx.Attr(Schema.String),
  done: SchemaFx.Attr(Schema.Boolean),
  createdAt: SchemaFx.Attr(SchemaFx.Instant),
  order: SchemaFx.Attr(SchemaFx.Long, { index: true }),
});

export const Todos = SchemaFx.Catalog({ todo: Todo });
```

Notes, all _(exists today)_: `Attr(schema, options?)` takes
`{ cardinality, unique, index, isComponent, doc, valueType }`. `Schema.String` →
`:db.type/string` and `Schema.Boolean` → `:db.type/boolean`, but **`Schema.Number` →
`:db.type/double`** — so use `SchemaFx.Long` for integers and `SchemaFx.Instant` (a
`Schema.Date`, so the TS value is a `Date`) for timestamps; anything else needs an explicit
`valueType`. `Namespace` stamps every key into an attr ref carrying `{ ident, optional, with }`,
so `Todo.title` is at once the query attr slot, the tx attr slot and the pull field — that is
what makes §2 and §3 the same language. The deep import path is explained in §6.

## 2. Client transact — the generator bag _(exists today; the wrapper is new)_

Writes go through the `transact` wrapper in `src/db.ts` (§4a, §5) — same body signature and
same `TxAck` as `db.transact`, but every ack floors the live queries. In `src/todos.ts`:

```ts
import { Todo } from "../schema.ts";
import { transact } from "./db.ts";

export const addTodo = async (title: string) => {
  const ack = await transact(function* (tx) {
    const t = yield* tx.entity();          // allocates tempid "tmp-1"
    yield* t.add(Todo.title, title);
    yield* t.add(Todo.done, false);
    yield* t.add(Todo.createdAt, new Date());
  });
  return ack.tempids["tmp-1"];             // the new eid
};

export const setDone = (eid: number, done: boolean) =>
  transact(function* (tx) { yield* tx.add(eid, Todo.done, done); });

export const deleteTodo = (eid: number) =>
  transact(function* (tx) { yield* tx.retractEntity(eid); });
```

Plain transacts — no invalidation call anywhere in this file. `TxBuilder` is
`entity() / entity(ref) / add / retract / retractEntity` and `EntityHandle` mirrors it; it is a
**bag** — any catalog attr on any entity, by design. Toggling needs no retract: cardinality-one
`:db/add` implicitly retracts the prior value. Ack is `{ t, txEid, tempids, datoms }` and the
generator's **return value is discarded** (a tx body always resolves to `TxAck`), so the new
eid comes from `ack.tempids["tmp-1"]` / `ack.tempids[handle.id]` (tempids are `tmp-1, tmp-2, …`).

## 3. Reactive subscription + pull — `examples/todos/src/live.ts` _(new for this POC)_

A live query is `{ where, find, pull }` where `pull` is **the same literate map `eid.pull`
already takes**, passed through unmodified. Nothing here is a second pull language.

```ts
export interface LiveSpec<C extends SchemaFx.AnyCatalog, B extends object, P> {
  readonly key: string;              // stable: React deps key + store-dedupe key
  readonly where: (q: SchemaFx.QueryBuilder<C, {}>) => SchemaFx.QueryBuilder<C, B>;
  readonly find: keyof B & SchemaFx.QueryVar;
  readonly pull: P;                  // passed verbatim to eid.pull
}
/** A pulled row plus its eid — the existing pull types, reused. */
export type LiveRow<C extends SchemaFx.AnyCatalog, P> =
  SchemaFx.PullResult<C, P> & { readonly eid: SchemaFx.Eid<C> };

export interface LiveStore<C extends SchemaFx.AnyCatalog, P> {
  readonly key: string;
  get(): readonly LiveRow<C, P>[] | undefined;   // undefined until first load; stable ref
  subscribe(cb: () => void): () => void;
  refresh(minT?: number): Promise<void>;
}
/** Identity helper so `P` infers `const` (what `Eid.pull<const P>` needs). */
export const spec = <C extends SchemaFx.AnyCatalog, B extends object, const P>(
  s: LiveSpec<C, B, P>,
): LiveSpec<C, B, P> => s;

export const allTodos = spec({
  key: "todos/all",
  where: (q) => q.where("?e", Todo.title, "_"),
  find: "?e",
  pull: { title: Todo.title, done: Todo.done,
          createdAt: Todo.createdAt, order: Todo.order.optional },
});
// row: { title: string; done: boolean; createdAt: Date; order: number | undefined; eid: Eid }
```

`liveQuery(db, spec)` is three existing calls:

1. `spec.where(db.q()).options({ minT }).query(spec.find)` — `.query`, not `.find`, because it
   keeps `t`. Rows are tuples whose entity-slot cell is an `Eid` wrapper. Comparing that `t` to
   the store's last basis is what makes polling cheap: an unmoved basis costs one round trip
   and notifies nobody.
2. `eid.pull(spec.pull, { minT })` per eid, fenced with the same `minT` as step 1. **One HTTP
   round trip per row today** (`POST /db/:name/pull`, no batching) — i.e. N+1. Fine for a POC
   list of tens of todos; run with `concurrency: 8`. Batched pull is a follow-up.
3. Drop `null` rows — `null` is the existing required-field filter (a bare, non-`.optional`
   attr that is missing drops the entity client-side in `reshapePullResult`), so a todo
   mid-retraction simply leaves the list.

**`minT` on `pull` is new for this POC** _(new — `packages/alchemy`)_: `ReadDatabaseClient.pull`
gains `options?: QueryOptions` and sets `x-ripple-min-t` exactly the way `q` already does, and
`EidPull` / `Eid.pull` gain a third `options` param that forwards it. ~5 lines; without it,
step 2 is unfenced across isolates.

```ts
const stores = new Map<string, LiveStore<any, any>>();
let floorT = 0;                              // highest t this tab has written or seen

export const liveQuery = (db, s) => {
  const hit = stores.get(s.key);
  if (hit) return hit;
  let rows: readonly any[] | undefined, basis = -1, chain = Promise.resolve();
  const subs = new Set<() => void>();
  const load = async (minT?: number) => {
    const opts = minT === undefined ? undefined : { minT };
    const b = s.where(db.q());
    const res = await run((opts ? b.options(opts) : b).query(s.find));
    if (res.t === basis && rows !== undefined) return;   // basis unmoved ⇒ skip the N pulls
    const eids = res.result as readonly (readonly [SchemaFx.Eid<any>])[];
    const pulled = await run(Effect.forEach(eids,
      ([e]) => e.pull(s.pull, opts).pipe(Effect.map((r) => (r === null ? null : { ...r, eid: e }))),
      { concurrency: 8 }));
    basis = res.t;
    rows = pulled.filter((r) => r !== null);             // required-field filter
    for (const cb of subs) cb();
  };
  const store: LiveStore<any, any> = {
    key: s.key,
    get: () => rows,
    subscribe: (cb) => { subs.add(cb); if (rows === undefined) void store.refresh();
                         return () => { subs.delete(cb); }; },
    refresh: (minT) => (chain = chain.then(() => load(minT ?? floorT || undefined)).catch(onError)),
  };
  stores.set(s.key, store);
  return store;
};
```

## 4. How updates flow _(new for this POC — wiring only)_

**(a) Local writes — the fence, applied once.** `db.transact` is wrapped exactly once in
`src/db.ts` (full sketch in §5) so *every* ack floors the live queries; there is no
invalidation API for the app to call and no call site that can forget:

```ts
// src/db.ts — the wrapper (full file in §5). Same body param as db.transact, but it
// resolves to a Promise<TxAck> (already run through the phantom runtime), not an Effect.
export const transact = (body: Parameters<typeof db.transact>[0]) =>   // infers Promise<TxAck>
  run(db.transact(body)).then((ack) => { onWrite(ack.t); return ack; });

// src/live.ts — internal, exported only for db.ts; not an app-facing API
export const onWrite = (t: number) => {
  if (t > floorT) floorT = t;
  for (const s of stores.values()) void s.refresh(t);
};
```

Every live query then re-runs its query *and* its pulls with `minT: ack.t`, which travels as
`x-ripple-min-t`; the Worker forces a basis refetch and polls the replica until
`basis.t >= minT`. That is read-your-writes: persist-before-ack means the SQLite write lands
*before* the ack resolves, so a `minT: ack.t` read can never miss the write it just made.

```
TodoRow    todos.ts    db.ts transact      peer           live.ts     React
  |-click-->|              |                 |               |          |
  |         |--transact--->|--POST /transact->| sqlite write |          |
  |         |              |<- { t: 42, tempids } ---------- |          |
  |         |              |--onWrite(42)---------------->|             |
  |         |              |                 |<- POST /query  min-t: 42 -|
  |         |              |                 |-> { t: 42, result:[eid…] }|
  |         |              |                 |<- POST /pull   min-t: 42 -|
  |         |<-- ack ------|                 |-> rows ------------------>|
  |         |              |                 |               |--notify-->|
```

No `setState`, no refetch, no invalidation call in any component.

**(b) Remote writes (another tab) — a basis watcher.** No push channel reaches a browser, so
`live.ts` starts one interval:

```ts
export const startBasisWatcher = (ms = 2000) =>
  setInterval(() => { for (const s of stores.values()) void s.refresh(); }, ms);
```

An unfenced `refresh()` costs one `POST /query` per live query and the pulls only run when `t`
advanced past the store's `basis` (§3 step 1) — one small request every 2 s at idle. An unfenced
read may be served from a warm isolate's basis cache, up to `BASIS_TTL_MS ≈ 5 s` stale, so
worst-case cross-tab latency is ~7 s. Fine for a POC; `x-ripple-basis-t` is CORS-exposed if a
cheaper probe is wanted later.

**Why not WebSocket.** The Worker is HTTP-only: no WS route, no `/subscribe` proxy. `/subscribe`
lives only on the Transactor DO with the QueryReplica DO as its sole consumer, because Workers
are per-request and cannot hold a novelty socket. A replica-fed WS/SSE fan-out on the Worker is
the obvious follow-up — it would replace `startBasisWatcher` without touching §3 or §5 — but it
is out of scope here, as is routing writes over a WS.

## 5. React binding — `src/useLive.ts` + `src/App.tsx` + `src/db.ts` _(new for this POC)_

One hook over the §3 store. `subscribe` and `get` are stable closures on the store, and `get()`
returns the same array reference until a refresh replaces it — what `useSyncExternalStore` wants.

```tsx
// useLive.ts
export const useLive = <C extends SchemaFx.AnyCatalog, B extends object, P>(
  s: LiveSpec<C, B, P>,
): readonly LiveRow<C, P>[] | undefined => {
  const store = useMemo(() => liveQuery(db, s), [s.key]);
  return useSyncExternalStore(store.subscribe, store.get, store.get);
};

// App.tsx
type Row = LiveRow<typeof Todos, typeof allTodos.pull>;
export const App = () => <main><NewTodo /><TodoList /></main>;

const TodoList = () => {
  const rows = useLive(allTodos);
  return !rows ? <p>loading…</p>
    : <ul>{rows.map((r) => <TodoRow key={r.eid.id} row={r} />)}</ul>;
};
const TodoRow = ({ row }: { row: Row }) => (
  <li>
    <input type="checkbox" checked={row.done} onChange={() => setDone(row.eid.id, !row.done)} />
    <span>{row.title}</span>
    <button onClick={() => deleteTodo(row.eid.id)}>×</button>
  </li>
);
const NewTodo = () => {
  const [text, setText] = useState("");                    // the app's only useState
  return <form onSubmit={(e) => { e.preventDefault(); void addTodo(text); setText(""); }}>
    <input value={text} onChange={(e) => setText(e.target.value)} /></form>;
};
```

No component refetches, none writes list state after a transact, and none touches `live.ts`
except through `useLive` — the `transact` wrapper already pushed. The db is module-level; a
`<RippleProvider db>` would only re-add plumbing `live.ts`'s registry already covers.

```ts
// src/db.ts — imports: alchemy/RuntimeContext, effect/Effect,
//   @ripple/alchemy/schema, ../schema.ts (Todos), ./live.ts (onWrite)

/** Phantom runtime — a client built from concrete values never touches it. */
export const run = <A, E>(eff: Effect.Effect<A, E, RuntimeContext>): Promise<A> =>
  Effect.runPromise(eff.pipe(Effect.provide(RuntimeContext.phantom)));

const system = SchemaFx.makeSystem({
  url: import.meta.env.VITE_RIPPLE_URL ?? "http://localhost:8787",
  token: import.meta.env.VITE_RIPPLE_TOKEN,
});
// `create` ≡ `connect`; the write client re-ensures the catalog idempotently.
export const db = await run(system.create("todos", Todos));   // top-level await
export const transact = (body: Parameters<typeof db.transact>[0]) =>   // infers Promise<TxAck>
  run(db.transact(body)).then((ack) => { onWrite(ack.t); return ack; });   // §4a — only write path
```

## 6. App shape and how to run _(new for this POC)_

```
examples/todos/
  SPEC.md  schema.ts (§1, shared by browser + stack)  index.html  vite.config.ts
  resources.ts     Peer Worker + Ripple.System (copy of kv-style/resources.ts)
  alchemy.run.ts   stack + InstallSchema action
  src/  main.tsx (render + startBasisWatcher)  db.ts (§4a,§5)  todos.ts (§2)
        live.ts (§3,§4)  useLive.ts (§5)  App.tsx (§5)
```

`resources.ts` / `alchemy.run.ts` mirror `examples/kv-style/resources.ts` — same peer Worker
(`main: "./packages/worker/src/index.ts"`), same `Ripple.System("Sys", { peer: Peer })`, same
install action, retargeted:

```ts
export const InstallSchema = Alchemy.Action("InstallSchema", Effect.gen(function* () {
  const system = SchemaFx.fromWrite(yield* Ripple.WriteSystem(Sys));
  return Effect.fn(function* () { yield* system.create("todos", Todos); });
}).pipe(Effect.provide(Ripple.WriteSystemLocal)));
```

There is **no app Worker** — Vite serves the frontend, so `examples/kv-style/app.ts` has no
counterpart; and since the browser re-ensures on `create`, `InstallSchema` is belt-and-braces.

```
# 1 — the peer, from the repo root (Peer's `main` is repo-relative)
bun alchemy dev examples/todos/alchemy.run.ts       # peer on http://localhost:8787

# 2 — the UI
VITE_RIPPLE_URL=http://localhost:8787 bunx vite examples/todos
```

CORS is browser-ready already: `access-control-allow-origin: *`, allowed request headers
include `authorization` and `x-ripple-min-t`, exposed response headers include
`x-ripple-basis-t` / `-hit` / `-behind`. Auth is one shared bearer `RIPPLE_TOKEN`, off when unset.

**Two packaging facts** _(both new for this POC)_:

1. `@ripple/alchemy` is private, workspace-only and **TS-source** (`main: src/index.ts`), so
   Vite must resolve it by alias; and its barrel re-exports `Providers.ts`, which pulls in the
   deploy engine — not browser cargo. So alias the **schema subpath**:

   ```ts
   // examples/todos/vite.config.ts
   const root = fileURLToPath(new URL("../..", import.meta.url));
   export default defineConfig({
     plugins: [react()],
     resolve: { alias: {
       "@ripple/alchemy/schema": `${root}/packages/alchemy/src/schema/index.ts`,
       "@ripple/core": `${root}/packages/core/src/index.ts`,
     } },
     server: { fs: { allow: [root] } },
   });
   ```

   plus the matching `paths` entry in the root `tsconfig.json` so `bun run typecheck` (which
   compiles `examples/`) resolves it identically. Stack files keep the ordinary
   `import * as Ripple from "@ripple/alchemy"` — they are never bundled for the browser.

2. `examples/` is **not** a Bun workspace (workspaces are `packages/*`), so an
   `examples/todos/package.json` would never be installed. Put `react`, `react-dom`,
   `@types/react`, `vite`, `@vitejs/plugin-react` in the **root `devDependencies`** instead.

**Testing without Cloudflare.** `packages/alchemy/test/schema/io.test.ts` already builds an
in-process peer as a `FetchLike` over `@ripple/core`'s `Connection`; pass it as
`makeSystem({ url, fetch })` and `live.ts` runs under `bun test` with zero infrastructure —
`transact(…)`, then assert the store notified and `store.get()` contains the row.

## 7. Out of scope

Auth beyond the shared bearer; presence; offline/optimistic queueing; mobile; closed entity
types (`EntityHandle` is a bag by design); nested-map transact as the happy path (`transactWire`
stays the escape hatch); WS/SSE fan-out from the Worker; incremental view maintenance or a datom
cache on the client; query `.in()` / parameter binding (the typed builder always sends
`inputs: []` — use the untyped `db.q(query, inputs, options)` escape if ever needed); batched
pull; and any transactor change — no wrapping of `processTx`, no touching `SortedNovelty.flush`.

## 8. Summary

| Piece | Status | File |
|---|---|---|
| `Namespace` / `Attr` / `Catalog`, `Long` / `Instant` | exists today | `packages/alchemy/src/schema/{Namespace,Attribute,Catalog,valueTypes}.ts` |
| `makeSystem` → `create`≡`connect` + schema ensure | exists today | `packages/alchemy/src/schema/Client.ts` |
| Generator transact bag, `TxAck { t, txEid, tempids, datoms }` | exists today | `packages/alchemy/src/schema/Tx.ts`, `src/Client.ts` |
| Query builder `where/options({minT})/find/query`; `eid.pull(map)` + `null` filtering | exists today | `packages/alchemy/src/schema/{Query,Eid,Pull}.ts` |
| `x-ripple-min-t` fence, basis poll, persist-before-ack, open CORS | exists today | `packages/alchemy/src/Client.ts`, `packages/worker/src/`, `packages/transactor/src/` |
| Peer Worker + `Ripple.System` + `InstallSchema`; in-process `FetchLike` test peer | exists today | `examples/kv-style/{resources,alchemy.run}.ts`, `packages/alchemy/test/schema/io.test.ts` |
| `minT` passthrough on `pull` (`options?: QueryOptions`; third `Eid.pull` param) | new | `packages/alchemy/src/Client.ts`, `src/schema/Eid.ts` |
| Todo catalog | new | `examples/todos/schema.ts` |
| `liveQuery` / `LiveSpec` / `LiveStore` / `onWrite` / `startBasisWatcher` | new | `examples/todos/src/live.ts` |
| `useLive` hook (`useSyncExternalStore`) | new | `examples/todos/src/useLive.ts` |
| `db`, phantom-runtime `run`, notifying `transact` wrapper | new | `examples/todos/src/db.ts` |
| `addTodo` / `setDone` / `deleteTodo` (plain transacts) | new | `examples/todos/src/todos.ts` |
| `App` / `TodoList` / `TodoRow` / `NewTodo` | new | `examples/todos/src/App.tsx` |
| Stack files, Vite config + schema alias, React/Vite root devDependencies | new | `examples/todos/{resources,alchemy.run,vite.config}.ts`, root `tsconfig.json` + `package.json` |
