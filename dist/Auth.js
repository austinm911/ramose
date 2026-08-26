/**
 * The verifier/minter contract, declared once on the deploy side.
 *
 * Ramose verifies JWTs and never issues them — but the *shape* it verifies
 * (https://ramose.ai/guides/sign-in/) is a contract with two consumers: the peer's env
 * (`Server({ auth: { jwt } })` pins `RAMOSE_JWT_ISS` / `RAMOSE_JWT_AUD` /
 * `RAMOSE_JWT_MAX_TTL`) and the app's mint route (which signs the payload).
 * `AuthConfig` is that contract as one value; {@link claims} builds the
 * payload from it, so the minted lifetime equals the verifier's cap by
 * construction and a claim set the peer would reject fails at mint instead.
 *
 * `claims` is pure — no signing, no I/O. The app signs the payload with
 * whatever it has (Better Auth's `auth.api.signJWT`, `jose`, …).
 */
import { DATABASE_NAME_RE, invalidDatabaseName } from "./db/DatabaseName.js";
import { InvalidRequest } from "./db/Errors.js";
/** Cap on a token's lifetime when `RAMOSE_JWT_MAX_TTL` is unset, in seconds. */
export const DEFAULT_JWT_MAX_TTL = 900;
/** `classes` out of a policy value, compiled AST, or still the wire JSON. */
const declaredClasses = (policy) => {
    let parsed = policy;
    if (typeof policy === "string") {
        try {
            parsed = JSON.parse(policy);
        }
        catch {
            throw new InvalidRequest({
                message: "ramose: claims() was given a policy that is not valid JSON",
            });
        }
    }
    const classes = parsed?.classes;
    return Array.isArray(classes)
        ? classes.filter((c) => typeof c === "string")
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
 * const payload = Ramose.claims(
 *   AUTH,
 *   { sub: user.id, db: workspace, class: role },
 *   policy, // or compiled JSON; a policy value narrows `class`
 * );
 * const { token } = await auth.api.signJWT({ body: { payload } });
 * ```
 */
export function claims(auth, input, policy) {
    // JWT NumericDate is whole seconds, so a fractional ttl would mint a
    // fractional `exp` — reject it rather than round it.
    if (!Number.isInteger(auth.ttl) || auth.ttl <= 0) {
        throw new InvalidRequest({
            message: `ramose: auth.ttl must be a positive whole number of seconds, got ${auth.ttl}`,
        });
    }
    if (!DATABASE_NAME_RE.test(input.db))
        throw invalidDatabaseName(input.db);
    if (policy !== undefined) {
        const classes = declaredClasses(policy);
        if (!classes.includes(input.class)) {
            throw new InvalidRequest({
                message: `ramose: class ${JSON.stringify(input.class)} is not declared by the policy (classes: ${classes.join(", ")}) — an undeclared class grants nothing, so fail at mint`,
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
        ramose: {
            db: input.db,
            class: input.class,
            ...(input.attrs === undefined ? {} : { attrs: input.attrs }),
        },
    };
}
//# sourceMappingURL=Auth.js.map