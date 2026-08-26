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
import { useEffect, useState } from "octane";
import { readT } from "../react/read.ts";
import { seamOf, viewDep } from "../react/seam.ts";
import { splitSlot, subSlot } from "./internal.ts";

export function useBasis<C extends Schema.Any>(db: ReadDb<C>): number | undefined;
export function useBasis<C extends Schema.Any>(
  db: ReadDb<C>,
  ...rest: [slot?: symbol]
): number | undefined {
  const [, slot] = splitSlot(rest);
  const view = viewDep(db);
  const [t, setT] = useState<number | undefined>(
    () => readT(db),
    subSlot(slot, "basis:state"),
  );

  useEffect(
    () => {
      const pinned = seamOf(db)?.asOf;
      if (pinned !== undefined) {
        setT(pinned);
        return;
      }

      let disposed = false;
      const sync = (): void => {
        if (!disposed) setT(readT(db));
      };
      sync();

      const off = seamOf(db)?.onWake(() => {
        queueMicrotask(sync);
      });

      if (readT(db) === undefined) {
        void db
          .basis()
          .then((basis) => {
            if (!disposed) setT(readT(db) ?? basis.t);
          })
          .catch(() => {
            if (!disposed) setT((prev) => readT(db) ?? prev);
          });
      }

      return () => {
        disposed = true;
        off?.();
      };
    },
    [view],
    subSlot(slot, "basis:effect"),
  );

  return t;
}
