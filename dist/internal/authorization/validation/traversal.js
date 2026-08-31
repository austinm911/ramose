import * as Result from "effect/Result";
import { fieldAccessibleFrom, ownerFocus, requireEntity, requireField, requireOperation, requireTrait, } from "./catalog.js";
import { invalid } from "./common.js";
import { claimByKey } from "./descriptors.js";
import { emptyDerived, litScalar, resolveRefTarget, rowFromRefTarget, takeWork, } from "./types.js";
export const resourceFocus = (index, focus) => Result.gen(function* () {
    switch (focus._tag) {
        case "entity": {
            const entity = yield* requireEntity(index, focus.entity, "rule focus entity");
            return { _tag: "entity", entity };
        }
        case "trait": {
            const trait = yield* requireTrait(index, focus.trait, "rule focus trait");
            return { _tag: "trait", trait };
        }
        case "field": {
            const field = yield* requireField(index, focus.field, "rule focus field");
            return yield* ownerFocus(index, field.id.owner);
        }
        case "operation": {
            const operation = yield* requireOperation(index, focus.operation, "rule focus operation");
            return yield* ownerFocus(index, operation.id.owner);
        }
    }
});
export const meEntity = (index, principal) => Result.gen(function* () {
    if (principal.entity === undefined)
        return undefined;
    const field = yield* requireField(index, principal.entity, "principal field");
    if (field.unique === undefined) {
        return yield* invalid("principal field is not unique");
    }
    if (field.id.owner.kind !== "entity") {
        return yield* invalid("principal field must be entity-owned");
    }
    if (field.valueType !== "string" && field.valueType !== "uuid") {
        return yield* invalid("principal field must be string-compatible");
    }
    const entity = index.entities.get(field.id.owner.name);
    if (entity === undefined)
        return yield* invalid("missing principal entity");
    return entity;
});
export const walkRef = (index, term, resource, me, limits, spent) => Result.gen(function* () {
    const derived = emptyDerived();
    derived.staticWork = 1 + term.steps.length;
    yield* takeWork(spent, derived.staticWork, limits.maxStaticWork);
    let current;
    switch (term.root._tag) {
        case "resource":
            derived.usesResource = true;
            current = resource;
            break;
        case "me":
            derived.usesMe = true;
            if (me === undefined) {
                return yield* invalid("structurally invalid me traversal without a principal entity");
            }
            current = { _tag: "entity", entity: me };
            break;
    }
    const depth = term.steps.length;
    if (depth > limits.maxTraversalDepth) {
        return yield* invalid(`traversal depth ${depth} exceeds ${limits.maxTraversalDepth}`);
    }
    derived.traversalDepth = depth;
    if (term.steps.length === 0) {
        return { shape: { _tag: "row", focus: current }, derived };
    }
    let last;
    for (let i = 0; i < term.steps.length; i++) {
        const step = term.steps[i];
        const field = yield* requireField(index, step.field, "traversal field");
        if (!fieldAccessibleFrom(index, current, field)) {
            return yield* invalid(`wrong owner for field '${step.field.owner.kind}:${step.field.owner.name}.${step.field.localName}'`);
        }
        const isLast = i === term.steps.length - 1;
        if (!isLast) {
            if (field.cardinality === "many") {
                return yield* invalid("intermediate many-valued traversal is not supported");
            }
            if (field.valueType !== "ref") {
                return yield* invalid(`non-ref traversal through '${step.field.localName}'`);
            }
            const next = yield* rowFromRefTarget(index, field.refTarget, field.id.owner);
            if (next === undefined) {
                return yield* invalid(`cannot traverse from an untargeted ref through '${step.field.localName}'`);
            }
            current = next;
        }
        last = field;
    }
    if (last === undefined)
        return yield* invalid("empty traversal has no field");
    if (last.valueType === "ref") {
        const target = yield* resolveRefTarget(index, last.refTarget, last.id.owner);
        return {
            shape: {
                _tag: "ref",
                target,
                cardinality: last.cardinality,
            },
            derived,
        };
    }
    if (last.cardinality === "many") {
        return {
            shape: {
                _tag: "collection",
                element: { _tag: "scalar", valueType: last.valueType },
            },
            derived,
        };
    }
    return {
        shape: { _tag: "scalar", valueType: last.valueType },
        derived,
    };
});
export const walkValue = (index, term, resource, me, claims, limits, spent) => {
    const finish = (shape, derived) => Result.gen(function* () {
        yield* takeWork(spent, derived.staticWork, limits.maxStaticWork);
        return { shape, derived };
    });
    switch (term._tag) {
        case "ref":
            return walkRef(index, term, resource, me, limits, spent);
        case "lit":
            return finish(litScalar(term.value), { ...emptyDerived(), staticWork: 1 });
        case "subject":
            return finish({ _tag: "subject" }, { ...emptyDerived(), usesSubject: true, staticWork: 1 });
        case "me":
            return finish({ _tag: "me", entity: me }, { ...emptyDerived(), usesMe: true, staticWork: 1 });
        case "claim":
            return Result.gen(function* () {
                const claim = yield* claimByKey(claims, term.key);
                return yield* finish({ _tag: "claim", shape: claim.shape }, { ...emptyDerived(), staticWork: 1 });
            });
    }
};
//# sourceMappingURL=traversal.js.map