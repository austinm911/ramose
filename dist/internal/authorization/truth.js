export const True = { _tag: "True" };
export const False = { _tag: "False" };
export const Incomplete = (reason) => ({
    _tag: "Incomplete",
    reason,
});
export const Present = (value) => {
    if (value === undefined) {
        throw new TypeError("ramose/authorization: Present cannot hold undefined");
    }
    return { _tag: "Present", value };
};
export const FieldAbsent = { _tag: "FieldAbsent" };
export const EntityAbsent = { _tag: "EntityAbsent" };
export const NotLoadedProjection = { _tag: "NotLoaded" };
export const InvalidTraversalProjection = {
    _tag: "InvalidTraversal",
};
export const BudgetExhaustedProjection = {
    _tag: "BudgetExhausted",
};
export const MissingMeProjection = { _tag: "MissingMe" };
//# sourceMappingURL=truth.js.map