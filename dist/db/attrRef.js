/** @internal Shared attr-ref narrowing / ident lowering. Not part of the public surface. */
export const isAttrRef = (a) => typeof a === "object" &&
    a !== null &&
    "ident" in a &&
    typeof a.ident === "string";
/** `User.name` → `":user/name"`; an ident string passes through. */
export const lowerAttr = (a) => isAttrRef(a) ? a.ident : a;
//# sourceMappingURL=attrRef.js.map