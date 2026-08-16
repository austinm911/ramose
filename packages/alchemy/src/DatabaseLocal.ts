/**
 * Shared scaffolding for the `*Local` Ripple database capabilities — the
 * layers you provide inside an {@link Alchemy.Action} or under
 * `alchemy dev`, where the code runs in the *engine's* process rather than in
 * a deployed Worker.
 *
 * It is deliberately the same client as the `*Http` variants: unlike KV,
 * Ripple has no second protocol to fall back to — one HTTP API serves the
 * Worker, the operator and the test. What differs is only the context it
 * resolves in. `Output.bind` cooperates with the Action runtime context
 * (capture at init, resolve at apply), so `db.url` resolves to whatever the
 * engine just deployed — the workers.dev URL on a live deploy, the local
 * workerd dev server's URL under `alchemy dev`.
 *
 * Consequently these layers never call `host.bind`: there is no host.
 */

import { makeDatabaseHttp, makeHttpSource } from "./DatabaseHttp.ts";

export { makeHttpSource as makeLocalSource };

export const makeDatabaseLocal = makeDatabaseHttp;
