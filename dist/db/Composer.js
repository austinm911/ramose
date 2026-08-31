export const COMPOSED_TRAITS = Symbol.for("ramose/composed-traits");
export const isComposer = (value) => (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    (value._tag === "Entity" ||
        value._tag === "Trait");
//# sourceMappingURL=Composer.js.map