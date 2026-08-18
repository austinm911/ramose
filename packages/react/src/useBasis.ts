/**
 * `useBasis` — where the database's basis is, as React state.
 *
 * On a live view: `db.basis()` once on mount, then again on every wake of
 * the db's session — a basis tick, a local `transact`, a reconnect. Each
 * re-read is one `GET /db/:name/info`, the cheapest question the peer
 * answers, and observing the basis bumps the session, so a standing `live`
 * that missed a tick re-runs too. On an HTTPS-only client (no `WebSocket`)
 * there is no session to tick and the read is one-shot.
 *
 * On an `asOf(t)` view the answer is `t` itself, synchronously on the first
 * render, with no request — the seam carries the pinned coordinate.
 *
 * `undefined` until the first answer lands (or after a terminal failure).
 */

import type { Catalog, ReadDb } from "@ripple/alchemy/db";
import * as Effect from "effect/Effect";
import { useEffect, useState } from "react";
import { seamOf, viewDep } from "./seam.ts";

export const useBasis = <C extends Catalog.Any>(
  db: ReadDb<C>,
): number | undefined => {
  const view = viewDep(db);
  const [t, setT] = useState<number | undefined>(() => seamOf(db)?.asOf);

  useEffect(() => {
    const pinned = seamOf(db)?.asOf;
    if (pinned !== undefined) {
      // a pinned view's basis is its coordinate: no request, nothing to tick
      setT(pinned);
      return;
    }

    let disposed = false;
    let landed: number | undefined;
    // last-write-wins by issue order: a slower `/info` from before a tick
    // must not overwrite the answer the tick's re-read already landed
    const runs = { issued: 0, applied: 0 };
    const read = (): void => {
      const seq = ++runs.issued;
      const land = (value: number | undefined): void => {
        if (disposed || seq < runs.applied) return;
        runs.applied = seq;
        landed = value;
        setT(value);
      };
      Effect.runFork(
        db.basis().pipe(
          Effect.flatMap((basis) => Effect.sync(() => land(basis.t))),
          Effect.catchCause(() => Effect.sync(() => land(undefined))),
        ),
      );
    };

    read();
    // observing the basis bumps the session, so the mount's own `/info`
    // wakes this subscriber back; defer a microtask (the read has landed by
    // then) and skip any wake that carries nothing newer than what landed
    const off = seamOf(db)?.onWake(() => {
      queueMicrotask(() => {
        if (disposed) return;
        const seen = seamOf(db)?.t();
        if (seen !== undefined && landed !== undefined && seen <= landed) {
          return;
        }
        read();
      });
    });
    return () => {
      disposed = true;
      off?.();
    };
    // structural: `db.asOf(t)` built inline must not re-poll per render
  }, [view]);

  return t;
};
