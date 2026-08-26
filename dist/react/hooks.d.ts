/** `useDb` and `useRamoseClaims` — the provider-owned seams. */
import type { Schema, Claims, Db } from "../db/index.ts";
/**
 * `client.db(name, schema)`, memoised on `[client, name, schema]`.
 *
 * The call itself is pure — no network, no ensure, no socket — so the memo is
 * purely about identity: a stable `Db` reference means effects and memos
 * keyed on it do not re-fire every render. Pass a module-scope schema (the
 * normal spelling) or the identity changes every render and the memo is
 * worthless.
 */
export declare const useDb: <C extends Schema.Any>(name: string, schema: C) => Db<C>;
/**
 * The provider's token payload, decoded, **not** verified — UI hints only
 * (`ramose.class`, `sub`, `exp`). Synchronous when the source already has a
 * cached JWT (Reef warms `token.claims()` before the board mounts); a cold
 * source mints once and this hook re-renders with the payload.
 *
 * Throws outside a provider. A string token decodes on the first render; a
 * mint function with no cache is `undefined` until something reads it.
 */
export declare const useRamoseClaims: () => Claims | undefined;
//# sourceMappingURL=hooks.d.ts.map