export const ENGINE_TYPE_ASSERTION = Symbol("ramose.engineTypeAssertion");
export const markEngineTypeAssertion = (value) => {
    Object.defineProperty(value, ENGINE_TYPE_ASSERTION, { value: true });
    return value;
};
export const restoreEngineTypeAssertions = (txData) => {
    for (const item of txData) {
        if (typeof item === "object" &&
            item !== null &&
            !Array.isArray(item) &&
            Object.hasOwn(item, ":ramose/type")) {
            markEngineTypeAssertion(item);
        }
    }
};
//# sourceMappingURL=tx-provenance.js.map