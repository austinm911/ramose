export const normalizeDoc = (doc) => doc === undefined || doc.trim().length === 0 ? undefined : doc;
export const DOCUMENTATION = Symbol.for("ramose.documentation");
export const documentationOf = (value) => value?.[DOCUMENTATION];
//# sourceMappingURL=documentation.js.map