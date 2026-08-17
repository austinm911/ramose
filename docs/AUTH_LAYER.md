# Auth layer — catalog-native policy from JWT claims

**Summary.** A policy ships with the catalog: a serializable AST of rules over catalog *attributes* and JWT claims, compiled at deploy into the peer Worker's env. The peer verifies a JWT into a `Principal`.
Reads become a **filtered `Db`** built at `dbFromBasis` — a datom `[e a v t]` is visible iff the read rule for `a` holds for `e`. Writes are checked twice: a fast-fail at Worker ingress, then authoritatively inside the Transactor's commit loop against the db the tx will actually apply to. Deny by default, everywhere.

## 1. Claims

```json
{ "iss": "https://auth.acme.example", "sub": "user_01HQ8ZK", "aud": "ripple:peer:prod",
  "exp": 1755500000, "iat": 1755499100,
  "ripple": { "db": "acme", "class": "member", "attrs": { "org": "org_42" } } }
```

| claim | req | use |
|---|---|---|
| `iss` | yes | must be in the peer's issuer set; pins the expected key rather than trusting the token's `kid` |
| `sub` | yes | the principal; one AVET lookup on the catalog's declared `principal` attribute per session |
| `aud` | yes | must equal `RIPPLE_JWT_AUD` — stops replay across peers |
| `exp`, `iat?` | `exp` | `exp - iat` capped by `RIPPLE_JWT_MAX_TTL` (default 15 min); `exp` re-checked per request and per frame |
| `ripple.db` | yes | **must equal the `/db/:name` in the route**. Tenant binding, never a query parameter |
| `ripple.class` | yes | exactly one, and must be declared in the policy's `classes`; an undeclared class grants nothing, never an outage |
| `ripple.attrs` | no | decoded by the policy's `claims` `Schema.Struct`; bound as `P.claims.attrs.org` |

`Claims = Schema.Struct({ iss, sub, aud, exp, iat?, ripple: Schema.Struct({ db, class, attrs? }) })`. `P.claims.sub`, `.iss`, `.aud`, `.exp` are those standard fields, typed; app attributes live under `P.claims.attrs`. **With no token**: if the policy declares an `anonymous` class, that class applies (the public-read shape); otherwise `Unauthorized`.

Membership, ownership and sharing are **datoms** (`[?org :org/members ?user]`), never token tuples: revocation lands on the next basis tick and a rule reads a grant at the basis it needs it. The token carries only the policy selector.

## 2. Policy in the catalog

```ts
const User    = SchemaFx.Namespace("user", { sub: SchemaFx.Attr(Schema.String, { unique: "identity" }) });
const Org     = SchemaFx.Namespace("org",  { members: SchemaFx.Attr(SchemaFx.Ref, { cardinality: "many" }) });
const Project = SchemaFx.Namespace("project", { org: SchemaFx.Attr(SchemaFx.Ref) });
const Doc     = SchemaFx.Namespace("doc", { title: SchemaFx.Attr(Schema.String), owner: SchemaFx.Attr(SchemaFx.Ref),
                                            project: SchemaFx.Attr(SchemaFx.Ref), audit: SchemaFx.Attr(Schema.String) });
export const App = SchemaFx.Catalog({ user: User, org: Org, project: Project, doc: Doc });

const P = SchemaFx.Policy;
const inOrg = P.ref(Doc.project, P.ref(Project.org, Org.members));   // doc → project → org → members ∋ principal
export const policy = P.policy(App, {
  principal: User.sub,                              // JWT `sub` → eid
  classes: ["anonymous", "member", "admin"],
  claims:  Schema.Struct({ org: Schema.String }),   // shape of `ripple.attrs`
  ns: {
    doc: {
      read:          P.allow(P.or(P.eq(Doc.owner, P.principal), inOrg)),
      create:        P.allow(inOrg),                // parent ref asserted in the same tx
      add: P.allow(P.eq(Doc.owner, P.principal)), retract: P.allow(P.eq(Doc.owner, P.principal)),
      retractEntity: P.allow(P.eq(Doc.owner, P.principal)),
      preset:        [P.preset(Doc.owner, P.principal)],
      attrs:         [P.attr(Doc.audit, { read: P.allow(P.class("admin")) })],
    },
    project: { read: P.allow(P.ref(Project.org, Org.members)) },
    org:     { read: P.allow(P.eq(Org.members, P.principal)) },
    user:    { read: P.allow(P.eq(User.sub, P.claims.sub)) },
  },
});
```

| combinator | means |
|---|---|
| `eq(attr, claim \| literal)` | a datom `[e attr v]` exists; on a card-many attribute this is membership |
| `ref(refAttr, target)` | follow `[e refAttr ?x]`, evaluate `target` at `?x`: a bare attribute means "contains the principal", or nest another `ref`/`eq`. Depth ≤ 3 |
| `class(c)` | `c === ripple.class`; folds to a constant per session, reads nothing |
| `and` / `or` / `not` | boolean composition inside one arm |
| `allow(expr)` / `deny(expr)` | arms of one op |
| `preset(attr, claim)` | the peer sets `attr` on `create` |
| `attr(a, { op: rule })` | attribute rule; narrows the namespace rule |

**Rules attach to attributes.** A namespace rule is shorthand for "every attribute under this prefix", so a newly added `:doc/ssn` inherits `doc.read` rather than becoming world-readable, and an entity carrying two namespaces' attributes needs no `ns(e)` function — every *datom* is judged by its own attribute. **Ops are named after the wire** (`Tx.ts:57-61`): `read | add | retract | retractEntity`, plus `create` — the first `add` for an entity with no datoms, checked against a `create` or `preset` rule that names its parent. `asOf` and `history` are `read` under the same filter; there is no `history` op. **Combination** is deny-by-default: per attribute per op, `allow` arms OR, any `deny` wins, an attribute rule ANDs with (only narrows) its namespace rule, and a namespace with no rule denies.

**Typed, and data.** `Claims`, `Principal` and the compiled AST are Effect `Schema`s — a tagged `Schema.Union` decoded with `Schema.decodeUnknown` at peer boot, so a malformed or stale-version policy fails at init, not on the first denied read. Rules are data, never closures. `eq(User.age, P.claims.attrs.n)` typechecks against the attribute's value type; `ref` takes the *target attribute* because a `:db.type/ref` carries no target-namespace type (`schema/Attribute.ts`), which also means the first hop's target namespace cannot be checked at deploy — only the depth bound and the target attribute's own type are. A policy ident absent from the installed schema folds its arm to `false`, reported once as a tagged `PolicyError` when compiling against the `Principal`; it never throws into a user's query. **One policy per deployed Worker**: the catalog is the app, the db name is the tenant, `ripple.db` binds a token to one tenant.

## 3. Enforcement

**Handshake.** Exact-compare `RIPPLE_TOKEN` first → a service `Principal` with class `admin` (an app tier acting for a user forwards that user's JWT; it must not reuse this token). Otherwise verify the JWT under an explicit per-verifier algorithm list. Then pin `iss`/`aud`, check `exp`, assert `ripple.db === db`, decode `Claims`, and resolve `principal` with one AVET lookup at the current basis. The frozen `Principal` is a **positional argument of `route()`**, so session sub-requests (`index.ts:127-137`, dispatch `:240`) cannot fall back to header sniffing. The per-isolate memo is keyed on `token + db`, ≤ 60 s.

**Fail closed.** `RIPPLE_POLICY` present ⇒ JWT verification is mandatory, and any inconsistent verifier config denies every `/db/*` and logs once at init. `RIPPLE_POLICY` absent with `RIPPLE_TOKEN` set ⇒ today's shared-token mode: one service principal, full access, explicitly the `admin` class. Neither ⇒ today's open dev mode. A configured policy also stops serving the demo console at `/` and narrows `access-control-allow-origin` to a configured origin list.

**Reads — a filtered `Db`.** `dbFromBasis` (`replica/src/basis.ts:44`) returns, per principal, a `Db` whose raw-access methods — `datoms`, `seekMany`, `first` (`core/src/db.ts:116-181`; `datomsArray` :160-164 delegates to `datoms`) — drop datoms the principal may not read. The engine, `pull`, `entity` and `entid` reach storage only through them, so coverage is structural rather than enumerated. Clause injection survives only as a planner optimisation for index pushdown, never as the semantics.

**Rules read the *unfiltered* db** at the current basis: a rule must be able to follow `:doc/owner` even when the principal cannot read it. Any rule is therefore, by construction, a 1-bit oracle over the data it reads — the same residual leak RLS has; accepted. `class()` folds at session start; entity-scoped rules and `ref` arrows memoize per `(rule, e)` for one request.

**`estimate` is not filtered.** It is planner metadata derived from node counts (`core/src/db.ts:173-177`), never materialised datoms, so it is computed over the unfiltered db and also charges the `maxCells` budget. A 413 body and the always-emitted `x-ripple-ms` / `r2-gets` / `cache-hits` headers are therefore a bounded side channel on invisible data — accepted, not closed. `explain` is admin-only.

**`asOf` / `history`.** The filtered `Db` carries two handles: the *data view* at the requested `t` (or history mode) and the *rule view*, always the current view at the current basis. Both derive from one `Basis`, so this costs no extra replica fetch. History includes retracted datoms and each is still judged by its attribute's `read` rule; a retracted authorization datom is absent from the rule view, so history cannot re-grant.

**`live`** is a client-side re-run of `q` + `pull`, so the filter covers it with no live-specific code. Rules are re-evaluated on every read; a revoked membership datom lands on the next read the caller actually issues, which its own cache headers can hold up to `ttl` (5 s) or `cache-mode: peer` (10 min). The tick carries `t` only — a per-db write-activity channel, never per-row.

**Writes — two stages, one authority.** *(a) Ingress pre-check* (`index.ts:150-160`), before the Transactor hop: build a `Db` at the replica basis, expand the ops, evaluate the rules, and fail fast with `Unauthorized` so an obviously-denied tx never costs a DO round trip. This stage is **best-effort only** — the replica lags the writer by a WS hop, so it is a latency optimisation, never a decision.

*(b) Authoritative check in the commit loop.* The `Principal`, verified in the Worker, travels to the Transactor DO as trusted metadata alongside the `TxData` on the queued tx (`transactor.ts:273-282`). Inside `commitLoop`'s batch loop (`transactor.ts:320-331`) — after `init()` (:294), so `this.conn` exists, and after every earlier tx in the batch has been applied — a **sibling step immediately before `await this.conn.transact(p.tx)` (:322)** evaluates the ops against `this.conn.db()` (`core/src/conn.ts:171`), the exact value `Connection.transact` is about to hand `processTx` (`conn.ts:216-220`). `processTx` is not wrapped and the novelty merge is untouched. A denial rejects through the existing per-tx catch (:326-330) as `TxRejected`; `basisT` has not moved, so no `t` is consumed and the batch's other txs still commit.

At stage (b), against that db:

1. Tempids, lookup refs and `:db.unique/identity` upserts resolve first (`tx.ts:232-271`). A tempid that resolves to an existing entity is `add` **on that entity**, not `create` — so an upsert cannot flip a `create` onto a row the principal cannot write.
2. `:db/retractEntity` expands (`tx.ts:336-364`) into its concrete closure — own datoms, component recursion, incoming VAET refs — and each retraction is checked; deny past a closure cap.
3. Card-one replacement (`tx.ts:308`) emits an implicit retract, checked as `retract` against pre-state.
4. Each resulting `(op, e, a)` must be allowed by `a`'s rule for that op. A `create` rule naming `ref(...)` resolves the parent from a ref the same tx asserts.
5. `preset` attributes are injected by the peer on `create`, after evaluation and exempt from it. A **client-supplied value for a preset attribute on `create` is `Unauthorized`**, never a silent overwrite; on an existing entity a preset attribute is `add: deny` unless a rule says otherwise, so an admin toggling a field never rewrites `:doc/owner`. An op whose attribute ident lies outside the deployed catalog is a schema op (below), whatever keys it carries.

Any denied op rejects the whole tx. Cost: one policy pass per non-admin tx on the single writer, inside the batch that was already serialized; admin and service principals skip it, as do dbs with no policy configured.

**Privileged surfaces.** `/admin/*` (`index.ts:161-173`) and `explain` require class `admin`. `/info` (`:214-228`) is allowed for any principal but reduces to `{db, t}`. `ensure` is a schema tx: `admin` runs it, and a non-admin's `ensure` succeeds iff its ident *set* is a subset of the deployed schema's idents — the peer then skips it silently rather than failing `Session.connect` on a frontend-before-backend deploy (`schema/Client.ts:312-325`). Transactor and Replica DOs are reachable only from the Worker, backed by a deploy-minted internal secret header required on every Worker→DO fetch, `/subscribe` included.

**Socket lifecycle.** A browser cannot set headers on a WebSocket handshake (`alchemy/Session.ts:26-29`), so the **initial** principal still rides the upgrade as `?token=` or `Authorization`, exactly as today (`sessionUrl`, `Session.ts:62-72`); a socket that presents nothing gets the `anonymous` principal or is refused. `{op:"auth", token}` is added for **refresh only** — re-verify, then swap. The swap is **per frame**: the principal is bound when a frame is planned (`worker/src/session.ts:118` `planOf`), so frames dispatched after the `auth` ack use the new principal and in-flight ones finish under the old — no drain, no serialization of `onMessage`. `ripple.db` is re-asserted per frame. Past `exp` the peer denies every frame and closes the socket on the next tick. Token revocation is bounded by `exp`; *grant* revocation is a datom and lands on the next read. **The client API is unchanged**; `openSession` gains an `auth` frame and a `setToken(token)`, so a refresh needs no reconnect and no `LiveStore` teardown — today's `openSession` (`alchemy/Session.ts:190-193`) has no setter, and real apps hold the session as a module-level `await`, so there is nowhere else to re-supply a token.

**Errors and leaks.** Entity ids are public — a ref to an unreadable entity still surfaces as a number. List read → filtered, possibly empty, no error. Single entity or `pull` → `NotFound`, indistinguishable from absent. Write → `Unauthorized` (403) gaining a `code` (e.g. `"policy"`) and the attribute ident, never values. A unique conflict against an invisible entity today returns that entity's eid and value verbatim (`tx.ts:296-303`); under a policy the peer maps it to `TxRejected` with `{error, code}` and **no eid**. **A read-masked attribute must be declared `.optional` in pull patterns**: `reshapePullResult` (`schema/Pull.ts:330`) drops an entity missing a *required* key, so a masked required attribute would silently delete the row instead of redacting the field — the policy compiler makes this a deploy-time error against the app's own pull patterns, not a printed list.

## 4. Seams

| seam | file:line | change |
|---|---|---|
| `authorized()` | `worker/src/index.ts:71-76` (call site `:283`) | → `principalOf(env, request, db)`; `Principal` becomes a positional arg of `route()` |
| raw access | `core/src/db.ts:116-181` | `datoms`/`seekMany`/`first` are the only read-enforcement points |
| `dbFromBasis` | `replica/src/basis.ts:44` (callers `index.ts:182, 201, 211`) | build the filtered `Db`; carry the unfiltered current-basis rule handle |
| transact ingress | `worker/src/index.ts:150-160` | stage (a): expand + check against the replica basis, fast-fail `Unauthorized` |
| commit loop | `transactor/src/transactor.ts:320-331` (queue push `:273-282`) | `Pending` carries the Worker-verified `Principal` beside `TxData`; stage (b) checks it against `this.conn.db()` (`core/src/conn.ts:171`) immediately before `:322`, rejecting as `TxRejected` |
| admin / `/info` | `worker/src/index.ts:161-173`, `:214-228` | require `admin`; `/info` reduces to `{db, t}` |
| session frames | `worker/src/session.ts:5-10`, `planOf :118` | add `{op:"auth", token}`; bind the principal per plan |
| client session | `alchemy/src/Session.ts:21-37`, `:190-193` | token stays on the upgrade; add `setToken` + the refresh `auth` frame |
| errors | `worker/src/errors.ts:23`, `toHttp:71-72`; `DatabaseTypes.ts:44-46` and the 401/403 arm of `fromResponse` `:119-175` | `Unauthorized` gains `code`/`attr`; upstream bodies mapped, not passed through; add `PolicyError` to `schema/Errors.ts` |
| policy value | `schema/Catalog.ts:15-20` | `Catalog` unchanged; `SchemaFx.Policy.policy(catalog, …)` is a separate value |
| Alchemy | `alchemy.run.ts:58-68` | the peer Worker declares its own env beside `RIPPLE_TOKEN`: `RIPPLE_POLICY: SchemaFx.Policy.compile(policy)`, `RIPPLE_JWKS_URL`, `RIPPLE_JWT_AUD`, `RIPPLE_JWT_MAX_TTL` |

## 5. Out of scope

JWT minting, IdP integration, login and refresh UX — Ripple verifies, never issues. Share links and delegated attenuation (a token narrowing a session to read-only, one namespace, `t`-bounded); `Principal` is the seam for it. Cross-database rules: a database is a name and a tenant boundary. Several catalogs on one peer. Server-side live subscriptions — `live` stays a client-side re-run.

## 6. Open questions

1. **Share by email needs a directory lookup.** `user.read` denies it, but a policy can simply publish `User.email` as a public read, or a `lookup` op can allow a `:db.unique/identity` lookup ref as a write target without read access — the same existence oracle unique attributes already give. Probably a policy choice, not a design hole; confirm before adding the op.
2. **Ingress/writer divergence.** Stage (a) can deny what stage (b) would allow (a grant committed in the lag window), turning a legal write into a spurious `Unauthorized` the client must retry. Accept it, or make stage (a) allow-biased and let stage (b) be the only denier?
3. **Per-db policy variants.** One Worker serves any `/db/:name` under one catalog and one policy. Do tenants ever need different rules over the same catalog — a policy keyed by db name — or is a separate deployment the answer?
