# SPEC: reactive todo POC

A React todo app on `@ripple/alchemy` SchemaFx that shows the primitives end to end:
a catalog, a client-side generator transact, and a **declarative reactive subscription
written in the existing pull syntax**. Writing a todo re-renders the list with no manual
refetch and no `useState` next to the `transact`.

Every heading and snippet below is tagged `_(exists today)_` or `_(new for this POC)_`.
Summary table in §8.

## 0. Goals, non-goals, and where things stand

**Goals**

- One screen: input + list + checkbox + delete, backed by a real Ripple peer.
- Show `db.transact(function* (tx) { … })` as the *only* write path from the browser.
- Show a subscription whose shape *is* an `eid.pull` map — one pull language, not two.
- Keep the new surface tiny: one ~120-line module (`live.ts`) + one hook (`useLive.ts`).

**Non-goals**

- No new query/pull syntax, no client-side cache or view maintenance, no engine changes
  beyond one optional 5-line `minT` passthrough (§4).
- No WebSocket / SSE fan-out (§4 explains why it cannot be the default today).

**Where things stand today** _(exists today)_

The Alchemy resource is the *peer* — `Ripple.System("Sys", { peer: Peer })`
(`packages/alchemy/src/System.ts:99-145`); a database is just a name, nothing is provisioned,
and `create` is literally `connect` (`schema/Client.ts:349,364,381`). A write client's `create`
ensures the catalog as one idempotent schema tx of per-db `:db/ident` datoms
(`schema/ensure.ts:17-52`, `schema/Client.ts:310-323`); a read client skips ensure because it
cannot transact (`Client.ts:346-350`). You cannot define and use an attribute in the same tx —
`processTx` resolves attrs against the *basis* schema (`packages/core/src/tx.ts:169-172`, 409
`tx/unknown-attribute`) — which is why ensure has to land first. The transactor is a single
writer with dense, gap-free `t` and persist-before-ack: one grouped SQLite write
(`packages/transactor/src/transactor.ts:340-343`) *then* the acks resolve (`:364`). The
QueryReplica DO is first-class and holds sorted novelty, but **novelty is server-side only**:
`/subscribe` is a Transactor-DO→Replica-DO WebSocket (`transactor-do.ts:113-120`,
`replica-do.ts:220-248`) the Worker never proxies. The public Worker exposes **HTTP only**
(`packages/worker/src/index.ts:125-209`) — no WS route — and the typed client has **no subscribe
API**: its surface is `q/query/info/health/asOf/history` + `transact*`
(`schema/Client.ts:54-122`). So reactivity here sits on `q` + `eid.pull` + a fence, not on push.

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

Four attributes, no kitchen sink. Notes, all `_(exists today)_`:

- `Attr(schema, options?)` with `{ cardinality, unique, index, isComponent, doc, valueType }`
  (`schema/Attribute.ts:13-21,65-82`).
- Value-type inference: `Schema.String` → `:db.type/string`, `Schema.Boolean` →
  `:db.type/boolean`, but **`Schema.Number` → `:db.type/double`** — use `SchemaFx.Long` for
  integers and `SchemaFx.Instant` (a `Schema.Date`, so the TS value is a `Date`) for timestamps
  (`schema/valueTypes.ts:73-85`). Anything else needs an explicit `valueType`.
- `Namespace` stamps every key into an *attr ref* carrying `{ ident, optional, with }`
  (`schema/Namespace.ts:45-70`), so `Todo.title` is simultaneously the query attr slot, the tx
  attr slot and the pull field. That single fact is what makes §2 and §3 the same language.
- `order` is optional; drop it if sorting by `createdAt` is good enough.

The deep import path (`@ripple/alchemy/schema`) is explained in §6.

## 2. Client transact — the generator bag _(exists today)_

Exactly the shape in `packages/alchemy/src/schema/usage.ts:36-46`, with `Todo.*` instead of
`User.*`. In `examples/todos/src/todos.ts`:

```ts
import { Todo } from "../schema.ts";
import { db, run } from "./db.ts";
import { bump } from "./live.ts";

export const addTodo = async (title: string) => {
  const ack = await run(
    db.transact(function* (tx) {
      const t = yield* tx.entity();          // allocates tempid "tmp-1"
      yield* t.add(Todo.title, title);
      yield* t.add(Todo.done, false);
      yield* t.add(Todo.createdAt, new Date());
    }),
  );
  bump(ack.t);                                // §4 — the only "reactivity" call in the app
  return ack.tempids["tmp-1"];                // the new eid
};

export const setDone = async (eid: number, done: boolean) => {
  const ack = await run(db.transact(function* (tx) { yield* tx.add(eid, Todo.done, done); }));
  bump(ack.t);
};

export const deleteTodo = async (eid: number) => {
  const ack = await run(db.transact(function* (tx) { yield* tx.retractEntity(eid); }));
  bump(ack.t);
};
```

- `TxBuilder` is `entity() / entity(ref) / add / retract / retractEntity`
  (`schema/Tx.ts:97-123`); `EntityHandle` mirrors it with `.id/.add/.retract/.retractEntity`
  (`Tx.ts:73-88`). It is a **bag** — any catalog attr on any entity, by design.
- Toggling needs no retract: cardinality-one `:db/add` implicitly retracts the previous value
  (`packages/core/src/tx.ts:19,308`).
- Ack is `{ t, txEid, tempids, datoms }` (`packages/alchemy/src/Client.ts:91-96`). The
  generator's **return value is discarded** — `runTxBody` always resolves to `TxAck`
  (`schema/Client.ts:185-196`), so the new entity id comes from
  `ack.tempids[handle.id]` / `ack.tempids["tmp-1"]` (tempids are `tmp-1, tmp-2, …`,
  `Tx.ts:211-217`).
- `run` is the phantom-runtime helper from the tests (`test/schema/io.test.ts:39-40`), see §5.

## 3. Reactive subscription + pull — `examples/todos/src/live.ts` _(new for this POC)_

The declarative API. A live query is `{ where, find, pull }` where `pull` is **the same literate
map `eid.pull` already takes** (`schema/Eid.ts:23-33`, `schema/usage.ts:52-64`) — it is passed
straight through, unmodified. Nothing here is a second pull language.

```ts
// examples/todos/src/live.ts  (types)
import type * as SchemaFx from "@ripple/alchemy/schema";

export interface LiveSpec<C extends SchemaFx.AnyCatalog, B extends object, P> {
  readonly key: string;              // stable: React deps key + store-dedupe key
  readonly where: (q: SchemaFx.QueryBuilder<C, {}>) => SchemaFx.QueryBuilder<C, B>;
  readonly find: keyof B & SchemaFx.QueryVar;
  readonly pull: P;                  // passed verbatim to eid.pull
}

/** A pulled row plus the eid it came from — the existing pull types, reused. */
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
```

The todo list's spec:

```ts
export const allTodos = spec({
  key: "todos/all",
  where: (q) => q.where("?e", Todo.title, "_"),
  find: "?e",
  pull: { title: Todo.title, done: Todo.done,
          createdAt: Todo.createdAt, order: Todo.order.optional },
});
// row: { title: string; done: boolean; createdAt: Date; order: number | undefined; eid: Eid }
```

`liveQuery(db, spec)` is implemented as exactly three existing calls:

1. Run the builder, fenced: `spec.where(db.q()).options({ minT }).query(spec.find)`.
   `.query` (not `.find`) is used because it keeps `t` (`schema/Query.ts:213-220`,
   `QueryResponse { t, root, result, meta }` at `packages/alchemy/src/Client.ts:98-104`).
   Rows come back as tuples whose entity-slot cell is an `Eid` wrapper
   (`schema/Client.ts:198-217`).
2. For each eid, `eid.pull(spec.pull)`. **Today this is one HTTP round trip per row**
   (`POST /db/:name/pull`, `packages/alchemy/src/Client.ts:366-380`; no batching) — i.e. N+1.
   Acceptable for a POC list of tens of todos; run with `concurrency: 8`. Batched pull is a
   follow-up, not part of this POC.
3. Drop `null` rows. `null` is the existing required-field filter: a bare (non-`.optional`)
   attr that is missing drops the entity, client-side, in `reshapePullResult`
   (`schema/Pull.ts:326-403`, applied at `Eid.ts:43-49`). A todo mid-retraction therefore
   simply leaves the list.

```ts
// examples/todos/src/live.ts  (implementation sketch)
const stores = new Map<string, LiveStore<any, any>>();
let floorT = 0;                              // highest t this tab has written or seen

export const liveQuery = (db, s) => {
  const hit = stores.get(s.key);
  if (hit) return hit;
  let rows: readonly any[] | undefined, basis = -1, chain = Promise.resolve();
  const subs = new Set<() => void>();

  const load = async (minT?: number) => {
    const b = s.where(db.q());
    const res = await run((minT === undefined ? b : b.options({ minT })).query(s.find));
    if (res.t === basis && rows !== undefined) return;   // basis unmoved ⇒ skip the N pulls
    const eids = res.result as readonly (readonly [SchemaFx.Eid<any>])[];
    const pulled = await run(Effect.forEach(eids,
      ([eid]) => eid.pull(s.pull).pipe(Effect.map((r) => (r === null ? null : { ...r, eid }))),
      { concurrency: 8 }));
    basis = res.t;
    rows = pulled.filter((r) => r !== null);             // required-field filter
    for (const cb of subs) cb();
  };

  const store: LiveStore<any, any> = {
    key: s.key,
    get: () => rows,
    subscribe: (cb) => {
      subs.add(cb);
      if (rows === undefined) void store.refresh();
      return () => { subs.delete(cb); };
    },
    refresh: (minT) => (chain = chain.then(() => load(minT ?? floorT || undefined)).catch(onError)),
  };
  stores.set(s.key, store);
  return store;
};
```

The step-1 short-circuit (`res.t === basis`) is what makes polling cheap: a poll that finds an
unmoved basis costs exactly one query round trip and notifies nobody.

## 4. How updates flow _(new for this POC — wiring only)_

**(a) Local writes — the fence.** `transact` → `ack.t` → the write helper calls `bump(ack.t)`:

```ts
export const bump = (t: number) => {
  if (t > floorT) floorT = t;
  for (const s of stores.values()) void s.refresh(t);
};
```

Every live query re-runs its `q` with `minT: t`. `minT` is sent as `x-ripple-min-t`
(`packages/alchemy/src/Client.ts:343-345`); the Worker forces a basis refetch and polls the
replica up to 6 × 20 ms ≈ 120 ms until `basis.t >= minT`
(`packages/worker/src/peer.ts:180-188`, `MIN_T_RETRIES = 5`, `MIN_T_RETRY_MS = 20`). That is
read-your-writes. Because persist-before-ack holds — the transactor's grouped SQLite write
returns *before* the acks resolve (`transactor.ts:340-343` then `:364`) — a `minT: ack.t`
fenced read can never observe a lost write.

```
TodoRow      todos.ts         peer                     live.ts        React
   |-onClick-->|                |                         |             |
   |           |--POST /transact--->| sqlite write, ack    |             |
   |           |<-- { t: 42, tempids } ------------------- |             |
   |           |--bump(42)------------------------------->|             |
   |           |                |<-- POST /query  x-ripple-min-t: 42 ----|
   |           |                |--- { t: 42, result: [eid…] } --------->|
   |           |                |<-- POST /pull (one per eid) ----------|
   |           |                |--- rows ----------------------------->|
   |           |                |                         |--notify---->|
   |           |                |                         |   re-render |
```

No `setState`, no refetch call in any component.

**(b) Remote writes (another tab) — a basis watcher.** There is no push channel to a browser, so
`live.ts` starts one interval:

```ts
export const startBasisWatcher = (ms = 2000) =>
  setInterval(() => { for (const s of stores.values()) void s.refresh(); }, ms);
```

An unfenced `refresh()` costs one `POST /query` per live query; its `t` is compared to the
store's `basis` and the pulls only run when `t` advanced (§3, step 1) — one small request every
2 s at idle. The unfenced read can be served from a warm isolate's basis cache, up to
`BASIS_TTL_MS = 5_000` stale (`packages/worker/src/peer.ts:136`), so worst-case cross-tab
latency is ~7 s. Fine for a POC; `x-ripple-basis-t` is CORS-exposed (`worker/src/index.ts:65`)
if a cheaper probe is wanted later.

**Why not WebSocket.** The public Worker exposes no WS route and no `/subscribe` proxy;
`/subscribe` lives only on the Transactor DO with the QueryReplica DO as its only consumer
(`transactor-do.ts:113-120`, `replica-do.ts:220-248`), because Workers are per-request and
cannot hold a novelty socket (root `SPEC.md:15`). Routing writes over a WS is out of scope. A
**replica-fed WS/SSE fan-out on the Worker** is the obvious follow-up: it would replace
`startBasisWatcher` without touching §3 or §5. Out of scope here.

**Known gap: `pull` cannot be fenced.** `ReadDatabaseClient.pull(eid, pattern)` takes no
`QueryOptions` (`packages/alchemy/src/Client.ts:138-141,366-380`) and `Eid.pull` has no options
arg (`schema/Eid.ts:28-32`). So step 2 of a refresh is *usually* fresh — step 1's fenced query
just refreshed that isolate's basis for the same db — but it is **not guaranteed** across
isolates. Two ways out, pick one:

- _(optional, new for this POC — 5 lines in `packages/alchemy`)_ thread `minT` through pull:
  add `options?: QueryOptions` to `ReadDatabaseClient.pull` and set `x-ripple-min-t` the way
  `q` already does (`Client.ts:343-345`), then add a third param to `EidPull` / `Eid.pull`.
  This is the correct fix and is small.
- _(POC-only mitigation, no engine change)_ in `load`, if a row pulls to `null` (or a just-written
  eid is missing) within one fenced refresh, retry that pull once after 50 ms.

## 5. React binding — `examples/todos/src/useLive.ts` + `App.tsx` _(new for this POC)_

One hook, `useSyncExternalStore` over the §3 store. `subscribe` and `get` are stable closures on
the store object, and `get()` returns the same array reference until a refresh replaces it, which
is exactly what `useSyncExternalStore` requires.

```tsx
// useLive.ts — imports: react, ./db.ts, ./live.ts
export const useLive = <C extends SchemaFx.AnyCatalog, B extends object, P>(
  s: LiveSpec<C, B, P>,
): readonly LiveRow<C, P>[] | undefined => {
  const store = useMemo(() => liveQuery(db, s), [s.key]);   // deps keyed by the stable spec key
  return useSyncExternalStore(store.subscribe, store.get, store.get);
};

// App.tsx
type Row = LiveRow<typeof Todos, typeof allTodos.pull>;

export const App = () => <main><NewTodo /><TodoList /></main>;

const TodoList = () => {
  const rows = useLive(allTodos);
  if (!rows) return <p>loading…</p>;
  return <ul>{rows.map((r) => <TodoRow key={r.eid.id} row={r} />)}</ul>;
};

const TodoRow = ({ row }: { row: Row }) => (
  <li>
    <input type="checkbox" checked={row.done}
           onChange={() => setDone(row.eid.id, !row.done)} />
    <span>{row.title}</span>
    <button onClick={() => deleteTodo(row.eid.id)}>×</button>
  </li>
);

const NewTodo = () => {
  const [text, setText] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); void addTodo(text); setText(""); }}>
      <input value={text} onChange={(e) => setText(e.target.value)} />
    </form>
  );
};
```

The only `useState` in the app is the uncontrolled-input buffer in `NewTodo`. No component
refetches, and none writes list state after a transact — `addTodo`/`setDone`/`deleteTodo` call
`bump(ack.t)` and the store pushes.

The db is module-level (`src/db.ts`); no provider, no Redux, no extra store. A `<RippleProvider
db>` would only re-add plumbing that `live.ts`'s module-level registry already covers.

```ts
// examples/todos/src/db.ts
import { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import * as SchemaFx from "@ripple/alchemy/schema";
import { Todos } from "../schema.ts";

/** Phantom runtime — a client built from concrete values never touches it.
 *  Same helper as packages/alchemy/test/schema/io.test.ts:39-40. */
export const run = <A, E>(eff: Effect.Effect<A, E, RuntimeContext>): Promise<A> =>
  Effect.runPromise(eff.pipe(Effect.provide(RuntimeContext.phantom)));

const system = SchemaFx.makeSystem({           // schema/Client.ts:404-407
  url: import.meta.env.VITE_RIPPLE_URL ?? "http://localhost:8787",
  token: import.meta.env.VITE_RIPPLE_TOKEN,    // SystemClientOptions: src/Client.ts:513-520
});

// `create` ≡ `connect`; the write client re-ensures the catalog idempotently.
export const db = await run(system.create("todos", Todos));   // top-level await
```

## 6. App shape and how to run _(new for this POC)_

```
examples/todos/
  SPEC.md  schema.ts (§1, shared by browser + stack)  index.html  vite.config.ts
  resources.ts     Peer Worker + Ripple.System (copy of kv-style/resources.ts)
  alchemy.run.ts   stack + InstallSchema action
  src/  main.tsx (render + startBasisWatcher)  db.ts (§5)  todos.ts (§2)
        live.ts (§3+§4)  useLive.ts (§5)  App.tsx (§5)
```

`resources.ts` / `alchemy.run.ts` mirror `examples/kv-style` — same peer Worker
(`main: "./packages/worker/src/index.ts"`, `examples/kv-style/resources.ts:42-46`), same
`Ripple.System("Sys", { peer: Peer })`, same install action, retargeted:

```ts
export const InstallSchema = Alchemy.Action("InstallSchema", Effect.gen(function* () {
  const system = SchemaFx.fromWrite(yield* Ripple.WriteSystem(Sys));
  return Effect.fn(function* () { yield* system.create("todos", Todos); });
}).pipe(Effect.provide(Ripple.WriteSystemLocal)));
```

There is **no app Worker** — Vite serves the frontend, so `examples/kv-style/app.ts` has no
counterpart (and its bundling hazard does not arise). The browser re-ensures on `create`, so
`InstallSchema` is belt-and-braces.

**Run** (two terminals):

```
# 1 — the peer, from the repo root (Peer's `main` is repo-relative)
bun alchemy dev examples/todos/alchemy.run.ts       # peer on http://localhost:8787

# 2 — the UI
VITE_RIPPLE_URL=http://localhost:8787 bunx vite examples/todos
```

CORS is already browser-ready: `access-control-allow-origin: *`, allowed request headers include
`authorization` and `x-ripple-min-t`, exposed response headers include `x-ripple-basis-t` /
`-hit` / `-behind` (`packages/worker/src/index.ts:61-66`). Auth is one shared bearer
`RIPPLE_TOKEN`, off when unset (`index.ts:68-74`).

**Two packaging facts to handle** _(both new for this POC)_:

1. `@ripple/alchemy` is a private, workspace-only, **TS-source** package
   (`main: src/index.ts`) — Vite must resolve it by alias, not by node resolution. And its
   barrel `src/index.ts:54` re-exports `Providers.ts`, which imports `alchemy/Provider` (the
   deploy engine) — not something to ship to a browser. So alias the **schema subpath**:

   ```ts
   // examples/todos/vite.config.ts
   const root = fileURLToPath(new URL("../..", import.meta.url));
   export default defineConfig({
     plugins: [react()],
     resolve: {
       alias: {
         "@ripple/alchemy/schema": `${root}/packages/alchemy/src/schema/index.ts`,
         "@ripple/core": `${root}/packages/core/src/index.ts`,
       },
     },
     server: { fs: { allow: [root] } },
   });
   ```

   plus the matching one-line `paths` entry in the root `tsconfig.json` so
   `bun run typecheck` (which compiles `examples/`) resolves it identically:
   `"@ripple/alchemy/schema": ["packages/alchemy/src/schema/index.ts"]`.
   The stack files keep the ordinary `import * as Ripple from "@ripple/alchemy"` — they are
   never bundled for the browser.

2. `examples/` is **not** a Bun workspace (workspaces are `packages/*` only), so an
   `examples/todos/package.json` would never be installed. **Decision: put `react`,
   `react-dom`, `@types/react`, `vite`, `@vitejs/plugin-react` in the root `devDependencies`**
   and add no package.json under `examples/todos`, matching how `kv-style` borrows root deps.

**Testing without Cloudflare.** `packages/alchemy/test/schema/io.test.ts:86-178` is a complete
in-process peer as a `FetchLike` over `@ripple/core`'s `Connection` (`/transact`, `/query`,
`/pull`, `/info`, `/health`). Pass it as `makeSystem({ url, fetch })` and `live.ts` is testable
under `bun test` with zero infrastructure: transact → `bump(ack.t)` → assert the store notified
and `store.get()` contains the row.

## 7. Out of scope

Auth beyond the shared bearer token; multiplayer presence; offline / optimistic queueing;
mobile; closed entity types (`EntityHandle` is a bag by design); nested-map transact as the happy
path (`transactWire`'s keyword soup stays the escape hatch); WS/SSE fan-out from the Worker;
incremental view maintenance or a datom cache on the client; query `.in()` / parameter binding
(the typed builder always sends `inputs: []`, `schema/Query.ts:171-177` — use the untyped
`db.q(query, inputs, options)` escape if ever needed); batched pull; and any change to the
transactor — no wrapping of `processTx`, no touching `SortedNovelty.flush`.

## 8. Summary

| Piece | Status | File |
|---|---|---|
| `Namespace` / `Attr` / `Catalog`, `Long` / `Instant` | exists today | `packages/alchemy/src/schema/{Namespace,Attribute,Catalog,valueTypes}.ts` |
| `makeSystem` → `create`≡`connect` + schema ensure | exists today | `schema/Client.ts:310-323,404-407` |
| Generator transact bag, `TxAck { t, txEid, tempids, datoms }` | exists today | `schema/Tx.ts:97-123`, `src/Client.ts:91-96` |
| Query builder `where/options({minT})/find/query` | exists today | `schema/Query.ts:179-221` |
| `eid.pull(map)` + required-field `null` filtering | exists today | `schema/{Eid,Pull}.ts` |
| `x-ripple-min-t` fence, basis poll, persist-before-ack | exists today | `src/Client.ts:343-345`, `worker/src/peer.ts:163-195`, `transactor/src/transactor.ts:340-364` |
| Open CORS + `x-ripple-basis-t` exposed | exists today | `packages/worker/src/index.ts:61-66` |
| Peer Worker + `Ripple.System` + `InstallSchema` pattern | exists today | `examples/kv-style/{resources,alchemy.run}.ts` |
| In-process `FetchLike` peer for tests | exists today | `packages/alchemy/test/schema/io.test.ts:86-178` |
| Todo catalog | new | `examples/todos/schema.ts` |
| `liveQuery` / `LiveSpec` / `LiveStore` / `bump` / `startBasisWatcher` | new | `examples/todos/src/live.ts` |
| `useLive` hook (`useSyncExternalStore`) | new | `examples/todos/src/useLive.ts` |
| `db` module + phantom-runtime `run` | new | `examples/todos/src/db.ts` |
| `addTodo` / `setDone` / `deleteTodo` (transact + `bump`) | new | `examples/todos/src/todos.ts` |
| `App` / `TodoList` / `TodoRow` / `NewTodo` | new | `examples/todos/src/App.tsx` |
| Stack files, Vite config + `@ripple/alchemy/schema` alias | new | `examples/todos/{resources,alchemy.run,vite.config}.ts`, root `tsconfig.json` |
| React/Vite devDependencies | new | root `package.json` |
| `minT` passthrough on `pull` (optional) | new | `packages/alchemy/src/Client.ts:138-141,366-380`, `schema/Eid.ts:28-32` |
