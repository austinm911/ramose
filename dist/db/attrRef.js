export const isAttrRef = (a) => typeof a === "object" &&
    a !== null &&
    "ident" in a &&
    typeof a.ident === "string";
export const lowerAttr = (a) => isAttrRef(a) ? a.ident : a;
//# sourceMappingURL=attrRef.js.map