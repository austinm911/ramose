import * as Result from "effect/Result";
import { entityComposes, requireEntity, requireField, requireOperation, requireTrait, traitComposes, } from "./catalog.js";
import { entityKey, fieldKey, invalid, operationKey, traitKey } from "./common.js";
const uniqueDecisionIds = (ids, label) => {
    const seen = new Set();
    for (const id of ids) {
        if (seen.has(id))
            return invalid(`duplicate ${label} rule`);
        seen.add(id);
    }
    return Result.succeed(undefined);
};
const ruleFitsEntity = (index, rule, target) => {
    if (rule.focus._tag === "entity") {
        return rule.focus.entity.catalog === target.catalog && rule.focus.entity.name === target.name;
    }
    if (rule.focus._tag === "trait")
        return entityComposes(index, target, rule.focus.trait.name);
    return false;
};
const ruleFitsTrait = (index, rule, target) => {
    if (rule.focus._tag !== "trait")
        return false;
    return traitComposes(index, target, rule.focus.trait.name);
};
const ruleFitsField = (index, rule, field) => {
    if (rule.focus._tag === "field")
        return fieldKey(rule.focus.field) === fieldKey(field.id);
    if (field.id.owner.kind === "entity") {
        const owner = index.entities.get(field.id.owner.name);
        return owner !== undefined && ruleFitsEntity(index, rule, owner);
    }
    const owner = index.traits.get(field.id.owner.name);
    return owner !== undefined && ruleFitsTrait(index, rule, owner);
};
const ruleFitsOperation = (rule, target) => rule.focus._tag === "operation" &&
    operationKey(rule.focus.operation) === operationKey(target);
const lookupRule = (rules, id) => {
    const found = rules.get(id);
    if (found === undefined)
        return invalid(`unknown rule '${id}'`);
    return Result.succeed(found);
};
const validateDecisionRules = (decision, rules, compatible) => Result.gen(function* () {
    yield* uniqueDecisionIds(decision.allow, "allow");
    yield* uniqueDecisionIds(decision.deny, "deny");
    const seen = new Set();
    for (const id of decision.allow) {
        seen.add(id);
        const rule = yield* lookupRule(rules, id);
        yield* compatible(rule);
    }
    for (const id of decision.deny) {
        if (seen.has(id))
            return yield* invalid("contradictory allow and deny rule");
        const rule = yield* lookupRule(rules, id);
        yield* compatible(rule);
    }
});
export const validateDecisions = (index, decisions, rules) => Result.gen(function* () {
    const seenEntities = new Set();
    for (const entry of decisions.entities) {
        const target = yield* requireEntity(index, entry.target, "entity decision target");
        const key = entityKey(target);
        if (seenEntities.has(key))
            return yield* invalid("duplicate entity decision target");
        seenEntities.add(key);
        yield* validateDecisionRules(entry.decision, rules, (rule) => ruleFitsEntity(index, rule, target)
            ? Result.succeed(undefined)
            : invalid("rule focus is incompatible with entity decision"));
    }
    const seenTraits = new Set();
    for (const entry of decisions.traits) {
        const target = yield* requireTrait(index, entry.target, "trait decision target");
        const key = traitKey(target);
        if (seenTraits.has(key))
            return yield* invalid("duplicate trait decision target");
        seenTraits.add(key);
        yield* validateDecisionRules(entry.decision, rules, (rule) => ruleFitsTrait(index, rule, target)
            ? Result.succeed(undefined)
            : invalid("rule focus is incompatible with trait decision"));
    }
    const seenFields = new Set();
    for (const entry of decisions.fields) {
        const target = yield* requireField(index, entry.target, "field decision target");
        const key = fieldKey(target.id);
        if (seenFields.has(key))
            return yield* invalid("duplicate field decision target");
        seenFields.add(key);
        yield* validateDecisionRules(entry.decision, rules, (rule) => ruleFitsField(index, rule, target)
            ? Result.succeed(undefined)
            : invalid("rule focus is incompatible with field decision"));
    }
    const seenOperations = new Set();
    for (const entry of decisions.operations) {
        const target = yield* requireOperation(index, entry.target, "operation decision target");
        const key = operationKey(target.id);
        if (seenOperations.has(key)) {
            return yield* invalid("duplicate operation decision target");
        }
        seenOperations.add(key);
        yield* validateDecisionRules(entry.decision, rules, (rule) => ruleFitsOperation(rule, target.id)
            ? Result.succeed(undefined)
            : invalid("rule focus is incompatible with operation decision"));
    }
});
//# sourceMappingURL=decisions.js.map