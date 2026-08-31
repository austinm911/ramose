import { isAuthPath, isJsonScalar, isPathCarrier, stepFromCarrier, } from "./types.js";
export const allow = { _tag: "const", value: true };
export const deny = { _tag: "const", value: false };
export const me = { _tag: "me" };
export const subject = { _tag: "subject" };
export const claim = (key) => ({ _tag: "claim", key });
export const lit = (value) => ({
    _tag: "lit",
    value,
});
export const hasClass = (className) => ({
    _tag: "hasClass",
    class: typeof className === "string" ? className : "",
});
export const all = (...exprs) => ({
    _tag: "and",
    exprs,
});
export const any = (...exprs) => ({
    _tag: "or",
    exprs,
});
export const not = (expr) => ({
    _tag: "not",
    expr,
});
const knownOperandTags = new Set(["me", "subject", "claim", "lit", "resource", "path"]);
export const boxOperand = (input) => {
    if (isAuthPath(input)) {
        return input.steps.length === 0
            ? { _tag: "resource" }
            : { _tag: "path", steps: input.steps };
    }
    if (isPathCarrier(input))
        return { _tag: "path", steps: [stepFromCarrier(input)] };
    if (isJsonScalar(input))
        return { _tag: "lit", value: input };
    if (typeof input === "object" &&
        input !== null &&
        typeof input._tag === "string" &&
        knownOperandTags.has(input._tag)) {
        return input;
    }
    return input;
};
export const eq = (left, right) => ({
    _tag: "eq",
    left: boxOperand(left),
    right: boxOperand(right),
});
export const contains = (collection, value) => ({
    _tag: "in",
    value: boxOperand(value),
    collection: boxOperand(collection),
});
//# sourceMappingURL=expr.js.map