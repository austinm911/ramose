import * as Data from "effect/Data";
export const NotLoaded = { _tag: "NotLoaded" };
export const InvalidTraversal = {
    _tag: "InvalidTraversal",
};
export const BudgetExhausted = {
    _tag: "BudgetExhausted",
};
export const MissingMe = { _tag: "MissingMe" };
export class InvalidIR extends Data.TaggedError("InvalidIR") {
}
export class CatalogMismatch extends Data.TaggedError("CatalogMismatch") {
}
export class AuthorizationBudgetExceeded extends Data.TaggedError("AuthorizationBudgetExceeded") {
}
export class AuthorizationDenied extends Data.TaggedError("AuthorizationDenied") {
}
export class CatalogUnitCorrupt extends Data.TaggedError("CatalogUnitCorrupt") {
}
export class CatalogVersionMismatch extends Data.TaggedError("CatalogVersionMismatch") {
}
//# sourceMappingURL=failures.js.map