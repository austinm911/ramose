---
title: Auth and policy
description: Three modes — open, one bearer token, or a catalog-native policy that turns JWT claims into a filtered Db. Deny by default, everywhere.
---

A Ripple peer has three auth modes, selected by environment:

| mode | env | who gets in |
| --- | --- | --- |
| Open | neither set | everyone — local dev |
| Shared token | `RIPPLE_TOKEN` | one bearer token, full access to every name — a service tier that is itself the authority |
| Policy | `RIPPLE_POLICY` (+ JWKS config) | JWT-verified principals, each bound to one database, reads filtered and writes checked per datom |

This page is about the third mode. The full design lives in
[`docs/AUTH_LAYER.md`](https://github.com/tvanhens/ripple/blob/master/docs/AUTH_LAYER.md).

## The idea

A policy ships with the catalog: a serializable AST of rules over catalog
*attributes* and JWT claims, compiled at deploy into the peer Worker's env.
The peer verifies a JWT into a `Principal`. Reads become a **filtered `Db`** —
a datom `[e a v t]` is visible iff the read rule for `a` holds for `e`. Writes
are checked twice: a fast-fail at Worker ingress, then authoritatively inside
the Transactor's commit loop against the exact database value the transaction
will apply to. Deny by default, everywhere.

Membership, ownership, and sharing are **datoms** (`[?org :org/members
?user]`), never token tuples: revocation lands on the next basis tick. The
token carries only the policy selector.

## The token

```json
{
  "iss": "https://auth.acme.example",
  "sub": "user_01HQ8ZK",
  "aud": "ripple:peer:prod",
  "exp": 1755500000,
  "ripple": { "db": "acme", "class": "member", "attrs": { "org": "org_42" } }
}
```

- `iss` must be in the peer's issuer set; `aud` must equal
  `RIPPLE_JWT_AUD`; `exp - iat` is capped by `RIPPLE_JWT_MAX_TTL`.
- `ripple.db` **must equal the `/db/:name` in the route** — a token is bound
  to one tenant, never a query parameter.
- `ripple.class` selects a policy class; an undeclared class grants nothing.
- With no token: if the policy declares an `anonymous` class, that applies
  (the public-read shape); otherwise `Unauthorized`.

## Writing a policy

```ts
import * as Ripple from "@ripple/alchemy"; // Policy is deploy-time, not on /db

const P = Ripple.Policy;
const inOrg = P.ref(Doc.project, P.ref(Project.org, Org.members));

export const policy = P.policy(App, {
  principal: User.sub, // JWT `sub` → entity, one AVET lookup per session
  classes: ["anonymous", "member", "admin"],
  claims: Schema.Struct({ org: Schema.String }), // shape of `ripple.attrs`
  ns: {
    doc: {
      read: P.allow(P.or(P.eq(Doc.owner, P.principal), inOrg)),
      create: P.allow(inOrg),
      add: P.allow(P.eq(Doc.owner, P.principal)),
      retract: P.allow(P.eq(Doc.owner, P.principal)),
      retractEntity: P.allow(P.eq(Doc.owner, P.principal)),
      preset: [P.preset(Doc.owner, P.principal)],
      attrs: [P.attr(Doc.audit, { read: P.allow(P.class("admin")) })],
    },
    project: { read: P.allow(P.ref(Project.org, Org.members)) },
    org: { read: P.allow(P.eq(Org.members, P.principal)) },
    user: { read: P.allow(P.eq(User.sub, P.claims.sub)) },
  },
});
```

### Combinators

| combinator | means |
| --- | --- |
| `eq(attr, claim \| literal)` | a datom `[e attr v]` exists; on a card-many attribute this is membership |
| `ref(refAttr, target)` | follow the ref, evaluate `target` there; depth ≤ 3 |
| `class(c)` | `c === ripple.class`; folds to a constant per session |
| `and` / `or` / `not` | boolean composition inside one arm |
| `allow(expr)` / `deny(expr)` | arms of one op |
| `preset(attr, claim)` | the peer sets `attr` on `create`; a client-supplied value is `Unauthorized` |
| `attr(a, { op: rule })` | attribute rule; only ever *narrows* the namespace rule |

### How rules combine

Rules attach to **attributes**. A namespace rule is shorthand for "every
attribute under this prefix" — a newly added `:doc/ssn` inherits `doc.read`
rather than becoming world-readable. Ops are `read | add | retract |
retractEntity`, plus `create` (the first `add` for an entity with no datoms).
Combination is deny-by-default: `allow` arms OR, any `deny` wins, an attribute
rule ANDs with its namespace rule, and a namespace with no rule denies.

## What enforcement looks like

- **Reads are a filtered `Db`.** The engine, `pull`, and `live` reach storage
  only through the filtered raw-access methods, so coverage is structural.
  Rules themselves read the *unfiltered* database — a rule may follow
  `:doc/owner` even when the principal cannot read it.
- **Writes are checked twice.** Ingress pre-check (fast fail, best-effort at
  the replica basis), then the authoritative pass inside the commit loop —
  after upsert resolution, `retractEntity` expansion, and card-one implicit
  retracts, each resulting `(op, e, a)` must be allowed. Any denial rejects
  the whole transaction as `TxRejected`; no `t` is consumed.
- **`asOf` and `history` are `read`** under the same filter, with rules always
  evaluated at the *current* basis — history cannot re-grant.
- **Fail closed.** `RIPPLE_POLICY` present makes JWT verification mandatory;
  inconsistent verifier config denies every `/db/*` and logs once at init.
  Under a policy, `RIPPLE_TOKEN` reaches `/health` and an already-deployed
  schema `ensure` only, and CORS narrows to `RIPPLE_ALLOWED_ORIGINS`.
- **Errors don't leak values.** Filtered lists are just shorter, possibly
  empty. A denied `pull` is `NotFound`, indistinguishable from absent. A
  denied write is `Unauthorized` with a code and the attribute ident — never
  values.

:::caution
A read-masked attribute must be declared `.optional` in pull patterns — a
masked *required* attribute would drop the entity from the result instead of
redacting the field. The policy compiler makes this a deploy-time error.
:::

## From the browser

Your auth Worker mints workspace-scoped JWTs; the client's job is only to
hand the current one to `Ripple.layer`. `Ripple.token.jwt(mint)` is the
shipped source for that: it calls `mint` lazily on the first read, caches the
token, shares one in-flight mint between concurrent readers, and re-mints once
the cached token is within two minutes of its `exp` (configurable via
`refreshMargin`). The layer re-reads its token on every (re)connect and every
`/transact`, so short-lived tokens refresh themselves with no other plumbing.

```ts
import * as Ripple from "@ripple/alchemy/db";
import * as ManagedRuntime from "effect/ManagedRuntime";

const source = Ripple.token.jwt(() =>
  fetch("/api/ripple-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace: "acme" }),
  })
    .then((r) => r.json())
    .then((body) => body.token),
);

const runtime = ManagedRuntime.make(
  Ripple.layer({ url: RIPPLE_URL, token: source }),
);
```

- `exp` comes from the JWT payload itself — `mint` returns nothing but the
  token. A payload with no `exp` is minted once and refreshed only by
  `source.invalidate()` (sign-out, tenant switch).
- `source.claims()` is the decoded payload — **not verified**, UI hints only:
  show `ripple.class` for role-aware chrome, never trust it for access.
- A `mint` that throws surfaces as `NetworkError`: `transact` fails typed and
  a standing `live` retries with its usual backoff. Throw an
  `Unauthorized` from `mint` to make `live` fail terminally instead.

## Wiring it up

```ts
const auth: Ripple.PeerAuth = {
  policy: process.env.RIPPLE_POLICY,      // Ripple.Policy.compile(policy)
  jwksUrl: process.env.RIPPLE_JWKS_URL,   // issuer public keys
  issuers: process.env.RIPPLE_JWT_ISS,    // comma-separated allow-list
  aud: process.env.RIPPLE_JWT_AUD,
  maxTtl: Number(process.env.RIPPLE_JWT_MAX_TTL ?? 900),
  allowedOrigins: process.env.RIPPLE_ALLOWED_ORIGINS,
  internalSecret: Ripple.internalSecret(process.env.RIPPLE_INTERNAL_SECRET),
};
```

Pass `...Ripple.authEnv(auth)` into the peer Worker's `env` and `auth` into
`Ripple.Server`. Every knob is listed in the
[configuration reference](/reference/configuration/).

Ripple verifies tokens; it never issues them. JWT minting, IdP integration,
login, and refresh UX live in your auth provider.
