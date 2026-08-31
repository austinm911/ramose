import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { CatalogMismatch, InvalidIR } from "./failures.js";
import { BOUND_AUTHORIZATION_IR_VERSION, } from "./ir.js";
import { AUTHORIZATION_LANGUAGE_VERSION } from "./version.js";
import { canonicalAuthorizationRuleMaterial, hashCanonicalRule } from "./decode.js";
const SEPARATOR = "\u0000";
const ownerKey = (owner) => `${owner.kind}${SEPARATOR}${owner.name}`;
const fieldKey = (owner, localName) => `${owner.kind}${SEPARATOR}${owner.name}${SEPARATOR}${localName}`;
const operationKey = (owner, localName, target) => `${owner.kind}${SEPARATOR}${owner.name}${SEPARATOR}${localName}${SEPARATOR}${target}`;
const ownerNameLocalKey = (name, localName) => `${name}${SEPARATOR}${localName}`;
const otherOwnerKind = (kind) => (kind === "entity" ? "trait" : "entity");
const invalid = (message) => Result.fail(new InvalidIR({ message }));
const mismatch = (fields) => Result.fail(new CatalogMismatch(fields));
const isBlank = (value) => value.length === 0;
const requireNonBlank = (value, label) => isBlank(value) ? mismatch({ message: `blank ${label}` }) : Result.succeed(value);
const intern = (map, key, value, label) => {
    if (map.has(key)) {
        return invalid(`ambiguous ${label}`);
    }
    map.set(key, value);
    return Result.succeed(undefined);
};
const pushIndex = (map, key, value) => {
    const existing = map.get(key);
    if (existing === undefined)
        map.set(key, [value]);
    else
        existing.push(value);
};
const catalogOfIdentity = (identity, expected, label) => {
    if (identity.catalog !== expected.catalog) {
        return mismatch({
            message: `cross-catalog ${label}`,
            expected: expected.catalog,
            actual: identity.catalog,
        });
    }
    return Result.succeed(undefined);
};
const validateTarget = (target, descriptor) => Result.gen(function* () {
    yield* Result.all([
        requireNonBlank(target.database, "database"),
        requireNonBlank(target.catalog, "catalog id"),
        requireNonBlank(target.catalogVersion, "catalog version"),
        requireNonBlank(target.schemaFingerprint, "schema fingerprint"),
        requireNonBlank(descriptor.database, "descriptor database"),
        requireNonBlank(descriptor.id, "descriptor catalog id"),
        requireNonBlank(descriptor.version, "descriptor catalog version"),
        requireNonBlank(descriptor.fingerprint, "descriptor schema fingerprint"),
    ]);
    if (target.database !== descriptor.database) {
        return yield* mismatch({
            message: "cross-database catalog",
            expectedDatabase: target.database,
            actualDatabase: descriptor.database,
        });
    }
    if (target.catalog !== descriptor.id) {
        return yield* mismatch({
            message: "cross-catalog descriptor",
            expected: target.catalog,
            actual: descriptor.id,
        });
    }
    if (target.catalogVersion !== descriptor.version) {
        return yield* mismatch({
            message: "stale catalog version",
            expected: target.catalog,
            actual: descriptor.id,
            expectedVersion: target.catalogVersion,
            actualVersion: descriptor.version,
        });
    }
    if (target.schemaFingerprint !== descriptor.fingerprint) {
        return yield* mismatch({
            message: "schema fingerprint mismatch",
            expected: target.catalog,
            actual: descriptor.id,
            expectedFingerprint: target.schemaFingerprint,
            actualFingerprint: descriptor.fingerprint,
        });
    }
});
const indexCatalog = (target, descriptor) => Result.gen(function* () {
    yield* validateTarget(target, descriptor);
    const entities = new Map();
    const traits = new Map();
    const fields = new Map();
    const operations = new Map();
    const owners = new Map();
    const fieldsByOwnerName = new Map();
    for (const entity of descriptor.entities) {
        yield* catalogOfIdentity(entity.id, target, "entity");
        if (isBlank(entity.id.name))
            return yield* invalid("blank entity name");
        yield* intern(entities, entity.id.name, entity.id, `entity identity '${entity.id.name}'`);
        const owner = { kind: "entity", name: entity.id.name };
        yield* intern(owners, ownerKey(owner), owner, `owner '${ownerKey(owner)}'`);
    }
    for (const trait of descriptor.traits) {
        yield* catalogOfIdentity(trait.id, target, "trait");
        if (isBlank(trait.id.name))
            return yield* invalid("blank trait name");
        yield* intern(traits, trait.id.name, trait.id, `trait identity '${trait.id.name}'`);
        const owner = { kind: "trait", name: trait.id.name };
        yield* intern(owners, ownerKey(owner), owner, `owner '${ownerKey(owner)}'`);
    }
    for (const field of descriptor.fields) {
        yield* catalogOfIdentity(field.id, target, "field");
        if (isBlank(field.id.localName))
            return yield* invalid("blank field local name");
        if (isBlank(field.id.owner.name))
            return yield* invalid("blank field owner name");
        if (!owners.has(ownerKey(field.id.owner))) {
            return yield* invalid(`missing owner ${field.id.owner.kind} '${field.id.owner.name}' for field '${field.id.localName}'`);
        }
        yield* intern(fields, fieldKey(field.id.owner, field.id.localName), field.id, `field identity '${field.id.owner.kind}:${field.id.owner.name}.${field.id.localName}'`);
        pushIndex(fieldsByOwnerName, ownerNameLocalKey(field.id.owner.name, field.id.localName), field.id);
        if (field.valueType === "ref") {
            yield* validateRefTarget(field.refTarget, target, entities, traits, "field ref target");
        }
    }
    for (const operation of descriptor.operations) {
        yield* catalogOfIdentity(operation.id, target, "operation");
        if (isBlank(operation.id.localName))
            return yield* invalid("blank operation local name");
        if (isBlank(operation.id.owner.name))
            return yield* invalid("blank operation owner name");
        if (!owners.has(ownerKey(operation.id.owner))) {
            return yield* invalid(`missing owner ${operation.id.owner.kind} '${operation.id.owner.name}' for operation '${operation.id.localName}'`);
        }
        yield* intern(operations, operationKey(operation.id.owner, operation.id.localName, operation.id.target), operation.id, `operation identity '${operation.id.owner.kind}:${operation.id.owner.name}.${operation.id.localName}:${operation.id.target}'`);
        yield* validateInputShape(operation.input, target, entities, traits);
    }
    for (const entity of descriptor.entities) {
        for (const trait of entity.traits) {
            yield* catalogOfIdentity(trait, target, "entity trait");
            if (!traits.has(trait.name)) {
                return yield* invalid(`missing trait '${trait.name}' composed by entity '${entity.id.name}'`);
            }
        }
    }
    for (const trait of descriptor.traits) {
        for (const composed of trait.traits) {
            yield* catalogOfIdentity(composed, target, "trait composition");
            if (!traits.has(composed.name)) {
                return yield* invalid(`missing trait '${composed.name}' composed by trait '${trait.id.name}'`);
            }
        }
    }
    for (const row of descriptor.traitComposition) {
        yield* catalogOfIdentity(row.composer, target, "trait-composition composer");
        yield* catalogOfIdentity(row.trait, target, "trait-composition trait");
        if (!entities.has(row.composer.name)) {
            return yield* invalid(`missing composer entity '${row.composer.name}'`);
        }
        if (!traits.has(row.trait.name)) {
            return yield* invalid(`missing composed trait '${row.trait.name}'`);
        }
        for (const transitive of row.transitive) {
            yield* catalogOfIdentity(transitive, target, "trait-composition transitive");
            if (!traits.has(transitive.name)) {
                return yield* invalid(`missing transitive trait '${transitive.name}'`);
            }
        }
    }
    return {
        target,
        entities,
        traits,
        fields,
        operations,
        owners,
        fieldsByOwnerName,
    };
});
const validateRefTarget = (refTarget, target, entities, traits, label) => Result.gen(function* () {
    if (refTarget === undefined || refTarget._tag === "self" || refTarget._tag === "untargeted") {
        return;
    }
    if (refTarget._tag === "entity") {
        yield* catalogOfIdentity(refTarget.entity, target, label);
        if (!entities.has(refTarget.entity.name)) {
            return yield* invalid(`missing ${label} entity '${refTarget.entity.name}'`);
        }
        return;
    }
    yield* catalogOfIdentity(refTarget.trait, target, label);
    if (!traits.has(refTarget.trait.name)) {
        return yield* invalid(`missing ${label} trait '${refTarget.trait.name}'`);
    }
});
const validateInputShape = (shape, target, entities, traits) => {
    switch (shape._tag) {
        case "scalar":
        case "opaque":
            return Result.succeed(undefined);
        case "ref":
            return validateRefTarget(shape.refTarget, target, entities, traits, "operation input ref target");
        case "array":
            return validateInputShape(shape.items, target, entities, traits);
        case "struct":
            return Result.gen(function* () {
                for (const field of shape.fields) {
                    yield* validateInputShape(field.shape, target, entities, traits);
                }
            });
    }
};
const bindEntity = (index, relative) => {
    if (isBlank(relative.name))
        return invalid("blank entity name");
    const bound = index.entities.get(relative.name);
    if (bound === undefined) {
        return invalid(`missing entity '${relative.name}'`);
    }
    return Result.succeed(bound);
};
const bindTrait = (index, relative) => {
    if (isBlank(relative.name))
        return invalid("blank trait name");
    const bound = index.traits.get(relative.name);
    if (bound === undefined) {
        return invalid(`missing trait '${relative.name}'`);
    }
    return Result.succeed(bound);
};
const bindField = (index, relative) => {
    if (isBlank(relative.localName))
        return invalid("blank field local name");
    if (isBlank(relative.owner.name))
        return invalid("blank field owner name");
    const exact = index.fields.get(fieldKey(relative.owner, relative.localName));
    if (exact !== undefined)
        return Result.succeed(exact);
    const sameName = index.fieldsByOwnerName.get(ownerNameLocalKey(relative.owner.name, relative.localName));
    if (sameName !== undefined) {
        const otherKind = sameName.find((field) => field.owner.kind !== relative.owner.kind);
        if (otherKind !== undefined) {
            return invalid(`wrong owner kind for field '${relative.owner.name}.${relative.localName}': expected ${relative.owner.kind}`);
        }
    }
    if (!index.owners.has(ownerKey(relative.owner))) {
        const swapped = { kind: otherOwnerKind(relative.owner.kind), name: relative.owner.name };
        if (index.owners.has(ownerKey(swapped))) {
            return invalid(`wrong owner kind for field '${relative.owner.name}.${relative.localName}': expected ${relative.owner.kind}`);
        }
        return invalid(`missing owner ${relative.owner.kind} '${relative.owner.name}' for field '${relative.localName}'`);
    }
    return invalid(`wrong local name for field '${relative.owner.kind}:${relative.owner.name}.${relative.localName}'`);
};
const bindOperation = (index, relative) => {
    if (isBlank(relative.localName))
        return invalid("blank operation local name");
    if (isBlank(relative.owner.name))
        return invalid("blank operation owner name");
    const exact = index.operations.get(operationKey(relative.owner, relative.localName, relative.target));
    if (exact !== undefined)
        return Result.succeed(exact);
    if (!index.owners.has(ownerKey(relative.owner))) {
        const swapped = { kind: otherOwnerKind(relative.owner.kind), name: relative.owner.name };
        if (index.owners.has(ownerKey(swapped))) {
            return invalid(`wrong owner kind for operation '${relative.owner.name}.${relative.localName}': expected ${relative.owner.kind}`);
        }
        return invalid(`missing owner ${relative.owner.kind} '${relative.owner.name}' for operation '${relative.localName}'`);
    }
    return invalid(`missing operation '${relative.owner.kind}:${relative.owner.name}.${relative.localName}:${relative.target}'`);
};
const bindFocus = (index, focus) => Result.gen(function* () {
    switch (focus._tag) {
        case "entity": {
            const entity = yield* bindEntity(index, focus.entity);
            return { _tag: "entity", entity };
        }
        case "trait": {
            const trait = yield* bindTrait(index, focus.trait);
            return { _tag: "trait", trait };
        }
        case "field": {
            const field = yield* bindField(index, focus.field);
            return { _tag: "field", field };
        }
        case "operation": {
            const operation = yield* bindOperation(index, focus.operation);
            return { _tag: "operation", operation };
        }
    }
});
const bindRefTerm = (index, term) => Result.gen(function* () {
    const steps = [];
    for (const step of term.steps) {
        const field = yield* bindField(index, step.field);
        steps.push({ field });
    }
    return { _tag: "ref", root: term.root, steps };
});
const bindValueTerm = (index, term) => {
    switch (term._tag) {
        case "ref":
            return bindRefTerm(index, term);
        case "lit":
        case "subject":
        case "me":
        case "claim":
            return Result.succeed(term);
    }
};
const bindExpr = (index, expr) => {
    switch (expr._tag) {
        case "const":
        case "hasClass":
            return Result.succeed(expr);
        case "and":
        case "or":
            return Result.gen(function* () {
                const exprs = yield* Result.all(expr.exprs.map((child) => bindExpr(index, child)));
                return { _tag: expr._tag, exprs };
            });
        case "not":
            return Result.gen(function* () {
                const child = yield* bindExpr(index, expr.expr);
                return { _tag: "not", expr: child };
            });
        case "eq":
            return Result.gen(function* () {
                const left = yield* bindValueTerm(index, expr.left);
                const right = yield* bindValueTerm(index, expr.right);
                return { _tag: "eq", left, right };
            });
        case "has":
            return Result.gen(function* () {
                const term = yield* bindValueTerm(index, expr.term);
                return { _tag: "has", term };
            });
        case "in":
            return Result.gen(function* () {
                const value = yield* bindValueTerm(index, expr.value);
                const collection = yield* bindValueTerm(index, expr.collection);
                return { _tag: "in", value, collection };
            });
    }
};
const bindRule = (index, rule) => Result.gen(function* () {
    const focus = yield* bindFocus(index, rule.focus);
    const expr = yield* bindExpr(index, rule.expr);
    const bound = {
        id: rule.id,
        focus,
        expr,
        usesResource: rule.usesResource,
        usesMe: rule.usesMe,
        usesSubject: rule.usesSubject,
        traversalDepth: rule.traversalDepth,
    };
    const material = yield* canonicalAuthorizationRuleMaterial(bound);
    return { rule: bound, material };
});
const remapRuleIds = (ids, map) => ids.map((id) => map.get(id) ?? id);
const remapDecision = (decision, map) => ({
    allow: remapRuleIds(decision.allow, map),
    deny: remapRuleIds(decision.deny, map),
});
const remapDecisionEntries = (entries, map) => entries.map((entry) => ({ ...entry, decision: remapDecision(entry.decision, map) }));
const bindDecisionEntries = (entries, bindTarget) => Result.gen(function* () {
    const bound = [];
    const seen = new Set();
    for (const entry of entries) {
        const target = yield* bindTarget(entry.target);
        if (seen.has(target)) {
            return yield* invalid("ambiguous bound decision target");
        }
        seen.add(target);
        bound.push({ target, decision: entry.decision });
    }
    return bound;
});
const bindDecisions = (index, decisions) => Result.gen(function* () {
    const entities = yield* bindDecisionEntries(decisions.entities, (target) => bindEntity(index, target));
    const traits = yield* bindDecisionEntries(decisions.traits, (target) => bindTrait(index, target));
    const fields = yield* bindDecisionEntries(decisions.fields, (target) => bindField(index, target));
    const operations = yield* bindDecisionEntries(decisions.operations, (target) => bindOperation(index, target));
    return { entities, traits, fields, operations };
});
const bindPrincipal = (index, principal) => Result.gen(function* () {
    if (principal.entity === undefined) {
        return { subjectClaim: principal.subjectClaim };
    }
    const entity = yield* bindField(index, principal.entity);
    return { subjectClaim: principal.subjectClaim, entity };
});
const clonePlain = (value) => {
    if (value === null || typeof value !== "object")
        return value;
    if (Array.isArray(value)) {
        return value.map((item) => clonePlain(item));
    }
    const copy = {};
    for (const key of Object.keys(value)) {
        copy[key] = clonePlain(value[key]);
    }
    return copy;
};
const freezePlain = (value) => {
    if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
        return value;
    }
    if (Array.isArray(value)) {
        for (const item of value)
            freezePlain(item);
    }
    else {
        for (const key of Object.keys(value)) {
            freezePlain(value[key]);
        }
    }
    return Object.freeze(value);
};
const freezeBound = (value) => freezePlain(clonePlain(value));
export const bindPolicyTemplateResult = (input) => Result.gen(function* () {
    const index = yield* indexCatalog(input.target, input.descriptor);
    const principal = yield* bindPrincipal(index, input.template.principal);
    const boundRules = yield* Result.all(input.template.rules.map((rule) => bindRule(index, rule)));
    const seen = new Map();
    const rules = [];
    for (let i = 0; i < input.template.rules.length; i++) {
        const source = input.template.rules[i].id;
        const { rule, material } = boundRules[i];
        const existing = seen.get(source);
        if (existing !== undefined) {
            return yield* invalid(existing === material
                ? `duplicate source rule id '${source}'`
                : `colliding source rule id '${source}'`);
        }
        seen.set(source, material);
        rules.push(rule);
    }
    const decisions = yield* bindDecisions(index, input.template.decisions);
    return freezeBound({
        _tag: "BoundAuthorizationIR",
        version: BOUND_AUTHORIZATION_IR_VERSION,
        languageVersion: AUTHORIZATION_LANGUAGE_VERSION,
        database: input.target.database,
        catalog: input.target.catalog,
        catalogVersion: input.target.catalogVersion,
        schemaFingerprint: input.target.schemaFingerprint,
        classes: input.template.classes,
        claims: input.template.claims,
        principal,
        rules,
        decisions,
    });
});
const restampBoundRuleIds = Effect.fn("Authorization.restampBoundRuleIds")(function* (bound) {
    const idMap = new Map();
    const rules = [];
    for (const rule of bound.rules) {
        const id = yield* hashCanonicalRule(rule);
        idMap.set(rule.id, id);
        rules.push({ ...rule, id });
    }
    return freezeBound({
        ...bound,
        rules,
        decisions: {
            entities: remapDecisionEntries(bound.decisions.entities, idMap),
            traits: remapDecisionEntries(bound.decisions.traits, idMap),
            fields: remapDecisionEntries(bound.decisions.fields, idMap),
            operations: remapDecisionEntries(bound.decisions.operations, idMap),
        },
    });
});
export const bindPolicyTemplate = Effect.fn("Authorization.bindPolicyTemplate")(function* (input) {
    const bound = yield* Effect.fromResult(bindPolicyTemplateResult(input));
    return yield* restampBoundRuleIds(bound);
});
export class AuthoritativeCatalog extends Context.Service()("ramose/authorization/AuthoritativeCatalog") {
}
export const bindAgainstAuthoritativeCatalog = Effect.fn("Authorization.bindAgainstAuthoritativeCatalog")(function* (target, template) {
    const catalogs = yield* AuthoritativeCatalog;
    const descriptor = yield* catalogs.resolve(target);
    return yield* bindPolicyTemplate({ target, descriptor, template });
});
//# sourceMappingURL=bind.js.map