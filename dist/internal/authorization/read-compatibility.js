import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { AuthorizationValueType, FieldCardinality, FieldUniqueness, } from "./catalog.js";
import { canonicalizeJson } from "./canonical-json.js";
import { InvalidIR } from "./failures.js";
import { ReadCompatibilityHash } from "./identities.js";
import { OwnerKind } from "./identities.js";
import { normalizeEntities, normalizeFields, normalizeTraitComposition, normalizeTraits, } from "./install/normalize.js";
export const READ_COMPATIBILITY_VERSION = 1;
export const GRAPH_READ_SEMANTICS_VERSION = "ramose.graph-read/v1";
const HASH_DOMAIN = "ramose.read-compatibility/v1\0";
const UTF8 = new TextEncoder();
const ReadOwner = Schema.Struct({ kind: OwnerKind, name: Schema.String });
const ReadRefTarget = Schema.Union([
    Schema.TaggedStruct("entity", { name: Schema.String }),
    Schema.TaggedStruct("trait", { name: Schema.String }),
    Schema.TaggedStruct("self", {}),
    Schema.TaggedStruct("untargeted", {}),
]);
const EntityReadDescriptor = Schema.Struct({
    name: Schema.String,
    traits: Schema.Array(Schema.String),
});
const TraitReadDescriptor = Schema.Struct({
    name: Schema.String,
    traits: Schema.Array(Schema.String),
});
const FieldReadDescriptor = Schema.Struct({
    owner: ReadOwner,
    localName: Schema.String,
    cardinality: FieldCardinality,
    unique: Schema.optionalKey(FieldUniqueness),
    index: Schema.Boolean,
    optional: Schema.Boolean,
    owned: Schema.Boolean,
    valueType: AuthorizationValueType,
    refTarget: Schema.optionalKey(ReadRefTarget),
});
const TraitCompositionReadDescriptor = Schema.Struct({
    composer: Schema.String,
    trait: Schema.String,
    transitive: Schema.Array(Schema.String),
});
export const ReadCompatibilityDescriptor = Schema.Struct({
    version: Schema.Literal(READ_COMPATIBILITY_VERSION),
    graphReadSemantics: Schema.Literal(GRAPH_READ_SEMANTICS_VERSION),
    entities: Schema.Array(EntityReadDescriptor),
    traits: Schema.Array(TraitReadDescriptor),
    fields: Schema.Array(FieldReadDescriptor),
    traitComposition: Schema.Array(TraitCompositionReadDescriptor),
});
const failure = (cause) => new InvalidIR({
    message: `read compatibility hash failed: ${cause instanceof Error ? cause.message : String(cause)}`,
});
const base64Url = (bytes) => {
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};
const readRefTarget = (target) => {
    switch (target._tag) {
        case "entity": return { _tag: "entity", name: target.entity.name };
        case "trait": return { _tag: "trait", name: target.trait.name };
        case "self": return { _tag: "self" };
        case "untargeted": return { _tag: "untargeted" };
    }
};
export const readCompatibilityDescriptor = (catalog) => Result.mapError(Result.gen(function* () {
    const [entities, traits, fields, traitComposition] = yield* Result.all([
        normalizeEntities(catalog.entities),
        normalizeTraits(catalog.traits),
        normalizeFields(catalog.fields),
        normalizeTraitComposition(catalog.traitComposition),
    ]);
    return {
        version: READ_COMPATIBILITY_VERSION,
        graphReadSemantics: GRAPH_READ_SEMANTICS_VERSION,
        entities: entities.map(({ id, traits }) => ({
            name: id.name,
            traits: traits.map((trait) => trait.name),
        })),
        traits: traits.map(({ id, traits }) => ({
            name: id.name,
            traits: traits.map((trait) => trait.name),
        })),
        fields: fields.map(({ id, doc: _, ...field }) => ({
            owner: id.owner,
            localName: id.localName,
            cardinality: field.cardinality,
            ...(field.unique === undefined ? {} : { unique: field.unique }),
            index: field.index,
            optional: field.optional,
            owned: field.owned,
            valueType: field.valueType,
            ...(field.valueType === "ref"
                ? { refTarget: readRefTarget(field.refTarget) }
                : {}),
        })),
        traitComposition: traitComposition.map((row) => ({
            composer: row.composer.name,
            trait: row.trait.name,
            transitive: row.transitive.map((trait) => trait.name),
        })),
    };
}), (error) => new InvalidIR({ message: error.message }));
export const canonicalizeReadCompatibility = (descriptor) => canonicalizeJson(Schema.encodeUnknownSync(ReadCompatibilityDescriptor)(descriptor));
export const hashReadCompatibility = Effect.fn("Authorization.hashReadCompatibility")(function* (catalog) {
    const descriptor = yield* Effect.fromResult(readCompatibilityDescriptor(catalog));
    const canonical = canonicalizeReadCompatibility(descriptor);
    const digest = yield* Effect.tryPromise({
        try: () => crypto.subtle.digest("SHA-256", UTF8.encode(`${HASH_DOMAIN}${canonical}`)),
        catch: failure,
    });
    return ReadCompatibilityHash.make(base64Url(new Uint8Array(digest)));
});
const collectReadNames = (value, classes, claims) => {
    if (value === null || typeof value !== "object")
        return;
    if (Array.isArray(value)) {
        for (const item of value)
            collectReadNames(item, classes, claims);
        return;
    }
    const record = value;
    if (record._tag === "hasClass" && typeof record.class === "string") {
        classes.add(record.class);
    }
    if (record._tag === "claim" && typeof record.key === "string")
        claims.add(record.key);
    for (const child of Object.values(record))
        collectReadNames(child, classes, claims);
};
const withoutCatalogIdentity = (value) => {
    if (value === null || typeof value !== "object")
        return value;
    if (Array.isArray(value))
        return value.map(withoutCatalogIdentity);
    const output = {};
    for (const [key, child] of Object.entries(value)) {
        if (key !== "catalog")
            output[key] = withoutCatalogIdentity(child);
    }
    return output;
};
export const canonicalizeReadPolicy = (policy) => {
    const decisions = {
        entities: policy.decisions.entities,
        traits: policy.decisions.traits,
        fields: policy.decisions.fields,
    };
    const ruleIds = new Set();
    for (const entries of Object.values(decisions)) {
        for (const entry of entries) {
            for (const id of [...entry.decision.allow, ...entry.decision.deny])
                ruleIds.add(id);
        }
    }
    const rules = policy.rules.filter((rule) => ruleIds.has(rule.id));
    const classes = new Set();
    const claims = new Set();
    for (const rule of rules)
        collectReadNames(rule.expr, classes, claims);
    return canonicalizeJson(withoutCatalogIdentity({
        version: 1,
        languageVersion: policy.languageVersion,
        principal: policy.principal,
        classes: policy.classes.filter((name) => classes.has(name)),
        claims: policy.claims.filter((claim) => claims.has(claim.key)),
        rules,
        decisions,
        accessPlans: policy.accessPlans.filter((plan) => ruleIds.has(plan.rule)),
    }));
};
//# sourceMappingURL=read-compatibility.js.map