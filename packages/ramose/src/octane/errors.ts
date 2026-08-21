/**
 * `errorMessage` — the one-liner every toast wants.
 *
 * Framework-neutral: it inspects a `DbError`, not a component. It lives under
 * `../react/` for historical reasons only (that entry was written first), and
 * the two bindings share the one implementation rather than drifting apart —
 * the same arrangement as `../react/seam.ts`.
 */

export { errorMessage } from "../react/errors.ts";
