/** The verified caller. Built by the peer from a JWT; frozen for the request. */
/**
 * Classes this principal holds in the current database.
 * Today: the token-carried class. #215 swaps the source for grant data
 * without changing {@link isSuperuser} / {@link canChangeSchema}.
 */
export function classesOf(p) {
    return p.classes ?? [p.class];
}
export function holdsClass(p, name) {
    return classesOf(p).includes(name);
}
/**
 * Total policy bypass. Standing, not a reserved class name: the policy
 * head names the class, and {@link classesOf} is the source.
 */
export function isSuperuser(p, policy) {
    return policy.superuser !== undefined && holdsClass(p, policy.superuser);
}
/**
 * May install or grow schema. Superuser always may; otherwise the
 * principal must hold a class in `schemaClasses` (default `[superuser]`).
 */
export function canChangeSchema(p, policy) {
    if (isSuperuser(p, policy))
        return true;
    const allowed = policy.schemaClasses ?? (policy.superuser !== undefined ? [policy.superuser] : []);
    return allowed.some((c) => holdsClass(p, c));
}
/** A principal is bound to exactly one database — exact match, no globs. */
export function allows(p, dbName) {
    return p.db === dbName;
}
export function claimValue(p, path) {
    let cur = p.claims;
    for (const k of path) {
        if (cur === null || typeof cur !== "object")
            return undefined;
        cur = cur[k];
    }
    return cur;
}
export function anonymousPrincipal(db, cls = "anonymous") {
    return { kind: "anonymous", class: cls, claims: {}, db };
}
//# sourceMappingURL=principal.js.map