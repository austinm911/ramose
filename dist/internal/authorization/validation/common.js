import * as Result from "effect/Result";
import { DEFAULT_AUTHORIZATION_BUDGET, MAX_TRAVERSAL_DEPTH } from "../bounds.js";
import { CatalogMismatch, InvalidIR } from "../failures.js";
export const defaultValidationLimits = {
    maxTraversalDepth: MAX_TRAVERSAL_DEPTH,
    maxStaticWork: DEFAULT_AUTHORIZATION_BUDGET,
};
const isFiniteNatural = (value) => Number.isFinite(value) && Number.isInteger(value) && value >= 0;
export const tightenValidationLimits = (overrides) => {
    if (overrides === undefined)
        return Result.succeed(defaultValidationLimits);
    const clamp = (key, hard) => {
        const value = overrides[key];
        if (value === undefined)
            return Result.succeed(hard);
        if (!isFiniteNatural(value)) {
            return invalid(`invalid ${key}: must be a finite natural number`);
        }
        return Result.succeed(Math.min(value, hard));
    };
    return Result.gen(function* () {
        const maxTraversalDepth = yield* clamp("maxTraversalDepth", defaultValidationLimits.maxTraversalDepth);
        const maxStaticWork = yield* clamp("maxStaticWork", defaultValidationLimits.maxStaticWork);
        return { maxTraversalDepth, maxStaticWork };
    });
};
export const SEPARATOR = "\u0000";
export const entityKey = (id) => `${id.catalog}${SEPARATOR}${id.name}`;
export const traitKey = (id) => `${id.catalog}${SEPARATOR}${id.name}`;
export const fieldKey = (id) => `${id.catalog}${SEPARATOR}${id.owner.kind}${SEPARATOR}${id.owner.name}${SEPARATOR}${id.localName}`;
export const operationKey = (id) => `${id.catalog}${SEPARATOR}${id.owner.kind}${SEPARATOR}${id.owner.name}${SEPARATOR}${id.localName}${SEPARATOR}${id.target}`;
export const invalid = (message) => Result.fail(new InvalidIR({ message }));
export const mismatch = (fields) => Result.fail(new CatalogMismatch(fields));
export const isBlank = (value) => value.length === 0;
export const requireNonBlank = (value, label) => isBlank(value) ? mismatch({ message: `blank ${label}` }) : Result.succeed(value);
//# sourceMappingURL=common.js.map