/**
 * `useBasis` — where the database's basis is. A live view reads
 * `session.t` synchronously and again on every session wake (a `{ op:
 * "tx" }` / resync, a local write, a reconnect) — no `GET /info` per
 * tick. An `asOf(t)` view answers `t` on the first render, with no
 * request. An HTTPS-only client has no session to wake: one `db.basis()`
 * so a useBasis-only tree still learns the peer's t. `undefined` until
 * the first answer lands.
 */
import type { Schema, ReadDb } from "../db/index.ts";
export declare const useBasis: <C extends Schema.Any>(db: ReadDb<C>) => number | undefined;
//# sourceMappingURL=useBasis.d.ts.map