/**
 * Example-app code, not a shipped name: `db.live` is a `Stream`, and this is
 * the twelve lines that turn one into React state.
 *
 * The stream must be hoisted (built once, outside render), because it is the
 * effect's dependency.
 */

import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import { useEffect, useState } from "react";

export const useLive = <A, E>(stream: Stream.Stream<A, E>) => {
  const [s, set] = useState<{ rows?: A; error?: Cause.Cause<E> }>({});
  useEffect(() => {
    const fiber = Effect.runFork(
      Stream.runForEach(stream, (rows) => Effect.sync(() => set({ rows }))).pipe(
        Effect.catchCause((error) =>
          Effect.sync(() => set((p) => ({ ...p, error }))),
        ),
      ),
    );
    return () => void Effect.runFork(Fiber.interrupt(fiber));
  }, [stream]);
  return s;
};
