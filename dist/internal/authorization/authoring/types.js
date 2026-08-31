export const AUTH_PATH_TAG = "AuthPath";
export const READ_RULE_TAG = "ReadRule";
export const INVOKE_RULE_TAG = "InvokeRule";
export const isAuthPath = (value) => (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    value._tag === AUTH_PATH_TAG &&
    Array.isArray(value.steps);
export const isEntityTarget = (value) => typeof value === "object" &&
    value !== null &&
    value._tag === "Entity" &&
    typeof value.ns === "string";
export const isTraitTarget = (value) => (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    value._tag === "Trait" &&
    typeof value.ns === "string";
export const isPathCarrier = (value) => typeof value === "object" &&
    value !== null &&
    !isAuthPath(value) &&
    typeof value.ident === "string";
export const isJsonScalar = (value) => {
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return true;
    return typeof value === "number" && Number.isFinite(value);
};
export const parseIdent = (ident) => {
    const match = /^:([^/]+)\/([^/]+)$/.exec(ident);
    if (match === null)
        return undefined;
    return { ns: match[1], localName: match[2] };
};
export const stepFromCarrier = (carrier) => {
    const ident = carrier.ident;
    const parsed = parseIdent(ident);
    const attrName = carrier.attrName;
    const localName = typeof attrName === "string" ? attrName : (parsed?.localName ?? ident);
    const revs = carrier.__revs ?? [];
    return {
        ident,
        localName,
        reverse: carrier.__reverse === true || revs.some(Boolean),
    };
};
//# sourceMappingURL=types.js.map