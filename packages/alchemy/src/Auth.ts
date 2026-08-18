/**
 * The verifier/minter contract, declared once on the deploy side.
 *
 * Ripple verifies JWTs and never issues them — but the *shape* it verifies
 * (docs/AUTH_LAYER.md §1) is a contract with two consumers: the peer's env
 * (`authEnv` pins `RIPPLE_JWT_ISS` / `RIPPLE_JWT_AUD` / `RIPPLE_JWT_MAX_TTL`)
 * and the app's mint route (which signs the payload). `AuthConfig` is that
 * contract as one value; {@link claims} builds the payload from it, so the
 * minted lifetime equals the verifier's cap by construction and a claim set
 * the peer would reject fails at mint instead.
 *
 * `claims` is pure — no signing, no I/O. The app signs the payload with
 * whatever it has (Better Auth's `auth.api.signJWT`, `jose`, …).
 */

import type { CompiledPolicy } from "@ripple/core/policy/ast.ts";
import { DATABASE_NAME_RE, invalidDatabaseName } from "./db/DatabaseName.ts";
import { InvalidRequest } from "./db/Errors.ts";

/**
 * The pinned verifier/minter contract. Declare once; hand it to
 * {@link import("./Server.ts").authEnv} (`{ auth }`) and to {@link claims}.
 */
export interface AuthConfig {
  /** The `iss` every token carries and the peer pins (`RIPPLE_JWT_ISS`). */
  readonly issuer: string;
  /** The `aud` every token carries and the peer pins (`RIPPLE_JWT_AUD`). */
  readonly audience: string;
  /**
   * Token lifetime, in whole seconds (JWT NumericDate). `authEnv` pins
   * `RIPPLE_JWT_MAX_TTL` to it; `claims` sets `exp = iat + ttl` — so the cap
   * holds by construction.
   */
  readonly ttl: number;
}

/** The subject-and-scope half of a claim set; {@link AuthConfig} is the rest. */
export interface ClaimsInput {
  /** The principal — resolved by the policy's `principal` attribute. */
  readonly sub: string;
  /** The one database this token is bound to (`ripple.db`). */
  readonly db: string;
  /** The policy class this token selects (`ripple.class`). */
  readonly class: string;
  /** App claims (`ripple.attrs`), decoded by the policy's `claims` struct. */
  readonly attrs?: Readonly<Record<string, unknown>> | undefined;
  /** The mint instant; `iat` is this in whole seconds. @default new Date() */
  readonly now?: Date | undefined;
}

/**
 * The payload the peer verifies (docs/AUTH_LAYER.md §1), as built — every
 * field present. The client-side `Claims` on `@ripple/alchemy/db` is the
 * same shape *decoded but unverified* (all-optional, UI hints only); this is
 * the minted original.
 */
export interface MintedClaims {
  readonly iss: string;
  readonly aud: string;
  readonly sub: string;
  readonly iat: number;
  readonly exp: number;
  readonly ripple: {
    readonly db: string;
    readonly class: string;
    readonly attrs?: Readonly<Record<string, unknown>>;
  };
}

/** `classes` out of a compiled policy, parsed or still the wire JSON. */
const declaredClasses = (
  policy: CompiledPolicy | string,
): readonly string[] => {
  let parsed: unknown = policy;
  if (typeof policy === "string") {
    try {
      parsed = JSON.parse(policy);
    } catch {
      throw new InvalidRequest({
        message: "ripple: claims() was given a policy that is not valid JSON",
      });
    }
  }
  const classes = (parsed as { classes?: unknown } | null)?.classes;
  return Array.isArray(classes)
    ? classes.filter((c): c is string => typeof c === "string")
    : [];
};

/**
 * Build the claim set the peer verifies. Pure: no signing, no I/O.
 *
 * Validates at mint what the peer would reject anyway: `db` must be a valid
 * database name, and — when a compiled policy is given — `class` must be one
 * the policy declares, because an undeclared class grants nothing, never an
 * outage. `exp - iat` is exactly `auth.ttl`.
 *
 * @example
 * ```typescript
 * const payload = Ripple.claims(
 *   AUTH,
 *   { sub: user.id, db: workspace, class: role },
 *   compiledPolicy,
 * );
 * const { token } = await auth.api.signJWT({ body: { payload } });
 * ```
 */
export const claims = (
  auth: AuthConfig,
  input: ClaimsInput,
  policy?: CompiledPolicy | string,
): MintedClaims => {
  // JWT NumericDate is whole seconds, so a fractional ttl would mint a
  // fractional `exp` — reject it rather than round it.
  if (!Number.isInteger(auth.ttl) || auth.ttl <= 0) {
    throw new InvalidRequest({
      message: `ripple: auth.ttl must be a positive whole number of seconds, got ${auth.ttl}`,
    });
  }
  if (!DATABASE_NAME_RE.test(input.db)) throw invalidDatabaseName(input.db);
  if (policy !== undefined) {
    const classes = declaredClasses(policy);
    if (!classes.includes(input.class)) {
      throw new InvalidRequest({
        message: `ripple: class ${JSON.stringify(input.class)} is not declared by the policy (classes: ${classes.join(", ")}) — an undeclared class grants nothing, so fail at mint`,
      });
    }
  }
  const iat = Math.floor((input.now ?? new Date()).getTime() / 1000);
  return {
    iss: auth.issuer,
    aud: auth.audience,
    sub: input.sub,
    iat,
    exp: iat + auth.ttl,
    ripple: {
      db: input.db,
      class: input.class,
      ...(input.attrs === undefined ? {} : { attrs: input.attrs }),
    },
  };
};
