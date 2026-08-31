import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { compareCanonicalKeys, canonicalizeJson } from "../canonical-json.js";
import { EntityDescriptor, FieldDescriptor, TraitComposition, TraitDescriptor, } from "../catalog.js";
import { CanonicalIdentitySchemas } from "../identities.js";
import { invalid } from "../validation/common.js";
const encodedJson = (encoded) => encoded;
const canonicalKey = (value) => {
    try {
        return Result.succeed(canonicalizeJson(encodedJson(value)));
    }
    catch (cause) {
        return invalid(`ambiguous installed identity: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
};
const compareCanonical = (left, right) => compareCanonicalKeys(left, right);
const sortByCanonical = (items, encode) => Result.gen(function* () {
    const keyed = [];
    for (const item of items) {
        const key = yield* canonicalKey(encode(item));
        keyed.push({ key, item });
    }
    keyed.sort((left, right) => compareCanonical(left.key, right.key));
    return keyed.map((entry) => entry.item);
});
const uniqueSorted = (items, encode, label) => Result.gen(function* () {
    const sorted = yield* sortByCanonical(items, encode);
    const seen = new Set();
    for (const item of sorted) {
        const key = yield* canonicalKey(encode(item));
        if (seen.has(key))
            return yield* invalid(`duplicate ${label}`);
        seen.add(key);
    }
    return sorted;
});
const encodeEntity = (id) => Schema.encodeUnknownSync(CanonicalIdentitySchemas.entity)(id);
const encodeTrait = (id) => Schema.encodeUnknownSync(CanonicalIdentitySchemas.trait)(id);
const encodeField = (id) => Schema.encodeUnknownSync(CanonicalIdentitySchemas.field)(id);
const encodeComposition = (row) => Schema.encodeUnknownSync(TraitComposition)(row);
const canonicalizeComposedTraits = (traits) => uniqueSorted(traits, encodeTrait, "composed trait");
const sortRuleIds = (ids) => [...ids].sort((left, right) => compareCanonical(left, right));
const normalizeDecision = (decision) => ({
    allow: sortRuleIds(decision.allow),
    deny: sortRuleIds(decision.deny),
});
const normalizeDecisionEntries = (entries, encodeTarget, label) => {
    const normalized = entries.map((entry) => ({
        target: entry.target,
        decision: normalizeDecision(entry.decision),
    }));
    return uniqueSorted(normalized, (entry) => encodeTarget(entry.target), label);
};
export const normalizeClasses = (classes) => uniqueSorted(classes, (name) => name, "class");
export const normalizeClaims = (claims) => uniqueSorted(claims, (claim) => claim.key, "claim");
export const normalizeEntities = (entities) => Result.gen(function* () {
    const closed = [];
    for (const entity of entities) {
        const traits = yield* canonicalizeComposedTraits(entity.traits);
        closed.push({
            id: entity.id,
            traits,
            ...(entity.doc === undefined ? {} : { doc: entity.doc }),
        });
    }
    return yield* uniqueSorted(closed, (entity) => encodeEntity(entity.id), "entity identity");
});
export const normalizeTraits = (traits) => Result.gen(function* () {
    const closed = [];
    for (const trait of traits) {
        const nested = yield* canonicalizeComposedTraits(trait.traits);
        closed.push({
            id: trait.id,
            traits: nested,
            ...(trait.doc === undefined ? {} : { doc: trait.doc }),
        });
    }
    return yield* uniqueSorted(closed, (trait) => encodeTrait(trait.id), "trait identity");
});
export const normalizeFields = (fields) => uniqueSorted(fields, (field) => encodeField(field.id), "field identity");
export const normalizeTraitComposition = (rows) => Result.gen(function* () {
    const closed = [];
    for (const row of rows) {
        const transitive = yield* uniqueSorted(row.transitive, encodeTrait, "transitive trait");
        closed.push({
            composer: row.composer,
            trait: row.trait,
            transitive,
        });
    }
    const sorted = yield* uniqueSorted(closed, (row) => ({ composer: encodeEntity(row.composer), trait: encodeTrait(row.trait) }), "trait-composition identity");
    return yield* uniqueSorted(sorted, encodeComposition, "trait-composition row");
});
const canonicalizeInputShape = (shape) => {
    switch (shape._tag) {
        case "scalar":
        case "ref":
        case "opaque":
            return shape;
        case "array":
            return { _tag: "array", items: canonicalizeInputShape(shape.items) };
        case "struct":
            return {
                _tag: "struct",
                fields: [...shape.fields]
                    .sort((left, right) => compareCanonicalKeys(left.key, right.key))
                    .map((field) => ({
                    key: field.key,
                    optional: field.optional,
                    shape: canonicalizeInputShape(field.shape),
                })),
            };
    }
};
export const normalizeOperations = (operations) => Result.gen(function* () {
    const normalized = [];
    for (const operation of operations) {
        const composers = yield* uniqueSorted(operation.composers, encodeEntity, "operation composer");
        const writes = yield* uniqueSorted(operation.writes, encodeEntity, "operation write entity");
        normalized.push({
            ...operation,
            input: canonicalizeInputShape(operation.input),
            output: canonicalizeInputShape(operation.output),
            composers,
            writes,
        });
    }
    return yield* uniqueSorted(normalized, (operation) => Schema.encodeUnknownSync(CanonicalIdentitySchemas.operation)(operation.id), "operation identity");
});
export const normalizeRules = (rules) => uniqueSorted(rules, (rule) => rule.id, "rule identity");
export const normalizeDecisions = (decisions) => Result.gen(function* () {
    const entities = yield* normalizeDecisionEntries(decisions.entities, encodeEntity, "entity decision target");
    const traits = yield* normalizeDecisionEntries(decisions.traits, encodeTrait, "trait decision target");
    const fields = yield* normalizeDecisionEntries(decisions.fields, encodeField, "field decision target");
    const operations = yield* normalizeDecisionEntries(decisions.operations, (operation) => Schema.encodeUnknownSync(CanonicalIdentitySchemas.operation)(operation), "operation decision target");
    return { entities, traits, fields, operations };
});
export const normalizeAccessPlans = (plans, rules) => Result.gen(function* () {
    const sorted = yield* uniqueSorted(plans, (plan) => plan.rule, "access-plan identity");
    if (sorted.length !== rules.length) {
        return yield* invalid("missing access plan");
    }
    const expected = new Set(rules.map((rule) => rule.id));
    for (const plan of sorted) {
        if (!expected.has(plan.rule)) {
            return yield* invalid(`conflicting access plan for '${plan.rule}'`);
        }
        expected.delete(plan.rule);
    }
    if (expected.size !== 0)
        return yield* invalid("missing access plan");
    return sorted;
});
export const normalizeValidatedTables = (validated, plans) => Result.gen(function* () {
    const classes = yield* normalizeClasses(validated.classes);
    const claims = yield* normalizeClaims(validated.claims);
    const rules = yield* normalizeRules(validated.rules);
    const decisions = yield* normalizeDecisions(validated.decisions);
    const accessPlans = yield* normalizeAccessPlans(plans, rules);
    return {
        classes,
        claims,
        rules,
        decisions,
        accessPlans,
    };
});
//# sourceMappingURL=normalize.js.map