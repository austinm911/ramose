---
title: Errors
description: Eight tagged errors and one union — what each means, and how to match on them with Effect.catchTags.
---

Every client error is a `Data.TaggedError`, and `DbError` is their union.
Match with `Effect.catchTags`:

```ts
const rows = yield* db
  .q(Ripple.query(Todo).select({ title: Todo.title }))
  .pipe(
    Effect.catchTags({
      QueryBudgetExceeded: () => Effect.succeed([]),
      Unavailable: () => Effect.succeed([]), // transactor rebooting; retry later
    }),
  );
```

## The errors

| tag | meaning | typical cause |
| --- | --- | --- |
| `TxRejected` | the transaction was refused; no `t` consumed | schema violation, unique conflict, policy denial, uninstalled catalog |
| `Unavailable` | the peer cannot serve right now (503) | transactor rebooting after an aborted batch; honor `retry-after` |
| `InvalidRequest` | the request is malformed | bad ident, invalid query shape, bad database name, querying an uninstalled catalog |
| `DatabaseNotFound` | the name does not resolve | wrong name on a policy-bound route |
| `Unauthorized` | the principal may not do this (401/403) | missing/expired token, policy denial — carries a `code` and the attribute ident, never values |
| `QueryBudgetExceeded` | the query blew the memory guardrail (413) | names the clause and the cell count; restructure or raise `RIPPLE_QUERY_MAX_CELLS` |
| `InternalError` | the peer failed | a bug or storage fault; logged server-side |
| `NetworkError` | the request never completed | fetch failure, dropped connection |
| `DbError` | the union of all of the above | — |

## Retry semantics

- **Transient platform errors are retried briefly, on every transport.**
  `Unavailable` and `NetworkError` walk a short jittered ladder (six
  attempts, ~150ms doubling to 2s) before they surface — for HTTPS and for
  reads over the session socket alike, so a read does not lose resilience by
  taking the socket. Application errors never retry.
- **`live` retries for you.** Beyond that ladder, dropped sockets, 5xx, and
  `NetworkError` are retried with backoff; the stream fails only on terminal
  `InvalidRequest`, `Unauthorized`, or `DatabaseNotFound`.
- **`transact` is not retried past that ladder.** A 503 (`Unavailable`)
  after a transactor abort means nothing from the failed batch was durable —
  retry the whole transaction.
- **`TxRejected` is not transient.** The transaction itself is wrong for the
  current database value (or denied by policy); retrying unchanged will
  reject again.

## Defects are not errors

Provisioning mistakes — a missing service binding, a malformed peer URL — are
`Effect.die`, not `DbError`. They surface at init, keep every signature's
requirements channel `never`, and never masquerade as retryable request
failures.
