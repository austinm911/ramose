import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { MAX_CATALOG_JSON_ENCODED_BYTES, MAX_CATALOG_JSON_NODES, MAX_COLLECTION_SIZE, MAX_JSON_DEPTH, MAX_JSON_ENCODED_BYTES, MAX_JSON_NODES, MAX_STRING_LENGTH, } from "./bounds.js";
import { canonicalizeJson, hasLoneSurrogate } from "./canonical-json.js";
import { EntityDescriptor, FieldDescriptor, OperationDescriptor, TraitComposition, TraitDescriptor, } from "./catalog.js";
import { InstalledCatalogUnit, LegacyInstalledCatalogUnitV1, } from "./catalog-unit.js";
import { InvalidIR } from "./failures.js";
import { CatalogUnitHash, EntityId, FieldId, OperationId, PolicyHash, RuleId, SchemaFingerprint, TraitId, } from "./identities.js";
import { normalizeEntities, normalizeFields, normalizeOperations, normalizeTraitComposition, normalizeTraits, } from "./install/normalize.js";
import { CanonicalAuthorizationRule, InstalledAuthorizationIR, PolicyTemplateIR, RelativeAuthorizationRule, } from "./ir.js";
import { AUTHORIZATION_CATALOG_SCHEMA_HASH_DOMAIN_V1, AUTHORIZATION_CATALOG_UNIT_HASH_DOMAIN_V2, AUTHORIZATION_POLICY_HASH_DOMAIN_V2, AUTHORIZATION_RULE_HASH_DOMAIN_V1, } from "./version.js";
import { sha256Hex } from "../core/bytes.js";
const STRICT = { onExcessProperty: "error" };
const UTF8 = new TextEncoder();
export const decodePolicyTemplateResult = (input) => decodeDocument(Schema.decodeUnknownResult(PolicyTemplateIR, STRICT), (rule) => encodedJson(Schema.encodeUnknownSync(RelativeAuthorizationRule)(rule)), input);
export const decodeInstalledAuthorizationResult = (input) => decodeDocument(Schema.decodeUnknownResult(InstalledAuthorizationIR, STRICT), (rule) => encodedJson(Schema.encodeUnknownSync(CanonicalAuthorizationRule)(rule)), input);
export const decodeLegacyInstalledCatalogUnitV1Result = (input) => decodeDocument(Schema.decodeUnknownResult(LegacyInstalledCatalogUnitV1, STRICT), (rule) => encodedJson(Schema.encodeUnknownSync(CanonicalAuthorizationRule)(rule)), input, MAX_CATALOG_JSON_NODES, MAX_CATALOG_JSON_ENCODED_BYTES);
export const decodeInstalledCatalogUnitResult = (input) => {
    const current = decodeDocument(Schema.decodeUnknownResult(InstalledCatalogUnit, STRICT), (rule) => encodedJson(Schema.encodeUnknownSync(CanonicalAuthorizationRule)(rule)), input, MAX_CATALOG_JSON_NODES, MAX_CATALOG_JSON_ENCODED_BYTES);
    if (Result.isSuccess(current))
        return current;
    const legacy = decodeLegacyInstalledCatalogUnitV1Result(input);
    if (Result.isSuccess(legacy)) {
        return Result.fail(new InvalidIR({
            message: legacy.success.catalog.operations.length === 0
                ? "legacy catalog unit v1 requires resealing by deployment"
                : "legacy catalog unit v1 has operation descriptors that cannot be migrated; redeploy the catalog",
        }));
    }
    return current;
};
export const decodePolicyTemplate = Effect.fn("decodePolicyTemplate")(function* (input) {
    return yield* Effect.fromResult(decodePolicyTemplateResult(input));
});
export const decodeInstalledAuthorization = Effect.fn("decodeInstalledAuthorization")(function* (input) {
    return yield* Effect.fromResult(decodeInstalledAuthorizationResult(input));
});
export const decodeInstalledCatalogUnit = Effect.fn("decodeInstalledCatalogUnit")(function* (input) {
    return yield* Effect.fromResult(decodeInstalledCatalogUnitResult(input));
});
export const encodePolicyTemplate = (document) => Schema.encodeUnknownSync(PolicyTemplateIR)(document);
export const encodeInstalledAuthorization = (document) => Schema.encodeUnknownSync(InstalledAuthorizationIR)(document);
export const encodeInstalledCatalogUnit = (document) => Schema.encodeUnknownSync(InstalledCatalogUnit)(document);
const encodeRelativeRule = (rule) => Schema.encodeUnknownSync(RelativeAuthorizationRule)(rule);
const encodeCanonicalRule = (rule) => Schema.encodeUnknownSync(CanonicalAuthorizationRule)(rule);
export const canonicalizePolicyTemplate = (document) => canonicalizeJson(encodedJson(encodePolicyTemplate(document)));
export const canonicalizeInstalledAuthorization = (document) => canonicalizeJson(encodedJson(encodeInstalledAuthorization(document)));
export const canonicalizeInstalledCatalogUnit = (document) => canonicalizeJson(encodedJson(encodeInstalledCatalogUnit(document)));
const concatUtf8 = (prefix, text) => {
    const left = UTF8.encode(prefix);
    const right = UTF8.encode(text);
    const out = new Uint8Array(left.length + right.length);
    out.set(left);
    out.set(right, left.length);
    return out;
};
const digestFailure = (cause) => new InvalidIR({
    message: `canonical hash failed: ${cause instanceof Error ? cause.message : String(cause)}`,
});
const canonicalizeJsonResult = (json) => {
    try {
        return Result.succeed(canonicalizeJson(json));
    }
    catch (cause) {
        return Result.fail(digestFailure(cause));
    }
};
export const hashCanonicalJson = Effect.fn("Authorization.hashCanonicalJson")(function* (json) {
    return yield* Effect.tryPromise({
        try: () => sha256Hex(UTF8.encode(canonicalizeJson(json))),
        catch: digestFailure,
    });
});
export const hashDomainSeparatedCanonicalText = Effect.fn("Authorization.hashDomainSeparatedCanonicalText")(function* (domain, canonicalText) {
    return yield* Effect.tryPromise({
        try: () => sha256Hex(concatUtf8(domain, canonicalText)),
        catch: digestFailure,
    });
});
export const hashDomainSeparatedCanonicalJson = Effect.fn("Authorization.hashDomainSeparatedCanonicalJson")(function* (domain, json) {
    const canonicalText = yield* Effect.fromResult(canonicalizeJsonResult(json));
    return yield* hashDomainSeparatedCanonicalText(domain, canonicalText);
});
export const hashPolicyTemplate = Effect.fn("Authorization.hashPolicyTemplate")(function* (document) {
    const digest = yield* hashDomainSeparatedCanonicalJson(AUTHORIZATION_POLICY_HASH_DOMAIN_V2, encodedJson(encodePolicyTemplate(document)));
    return PolicyHash.make(digest);
});
export const hashInstalledAuthorization = Effect.fn("Authorization.hashInstalledAuthorization")(function* (document) {
    const digest = yield* hashDomainSeparatedCanonicalJson(AUTHORIZATION_POLICY_HASH_DOMAIN_V2, omitKey(encodedJson(encodeInstalledAuthorization(document)), "policyHash"));
    return PolicyHash.make(digest);
});
export const hashInstalledCatalogUnit = Effect.fn("Authorization.hashInstalledCatalogUnit")(function* (document) {
    const digest = yield* hashDomainSeparatedCanonicalJson(AUTHORIZATION_CATALOG_UNIT_HASH_DOMAIN_V2, omitKey(encodedJson(encodeInstalledCatalogUnit(document)), "unitHash"));
    return CatalogUnitHash.make(digest);
});
export const hashCatalogSchemaFingerprint = Effect.fn("Authorization.hashCatalogSchemaFingerprint")(function* (tables) {
    const [entities, traits, fields, operations, traitComposition] = yield* Effect.fromResult(Result.all([
        normalizeEntities(tables.entities),
        normalizeTraits(tables.traits),
        normalizeFields(tables.fields),
        normalizeOperations(tables.operations),
        normalizeTraitComposition(tables.traitComposition),
    ]));
    const digest = yield* hashDomainSeparatedCanonicalJson(AUTHORIZATION_CATALOG_SCHEMA_HASH_DOMAIN_V1, encodedJson({
        entities: entities.map((entity) => Schema.encodeUnknownSync(EntityDescriptor)(entity)),
        traits: traits.map((trait) => Schema.encodeUnknownSync(TraitDescriptor)(trait)),
        fields: fields.map((field) => Schema.encodeUnknownSync(FieldDescriptor)(field)),
        operations: operations.map((operation) => Schema.encodeUnknownSync(OperationDescriptor)(operation)),
        traitComposition: traitComposition.map((row) => Schema.encodeUnknownSync(TraitComposition)(row)),
    }));
    return SchemaFingerprint.make(digest);
});
export const hashRelativeRule = Effect.fn("Authorization.hashRelativeRule")(function* (rule) {
    const digest = yield* hashDomainSeparatedCanonicalJson(AUTHORIZATION_RULE_HASH_DOMAIN_V1, omitKey(encodedJson(encodeRelativeRule(rule)), "id"));
    return RuleId.make(digest);
});
export const hashCanonicalRule = Effect.fn("Authorization.hashCanonicalRule")(function* (rule) {
    const material = yield* Effect.fromResult(canonicalAuthorizationRuleMaterial(rule));
    const digest = yield* hashDomainSeparatedCanonicalText(AUTHORIZATION_RULE_HASH_DOMAIN_V1, material);
    return RuleId.make(digest);
});
export const canonicalAuthorizationRuleJson = (rule) => omitKey(encodedJson(encodeCanonicalRule(rule)), "id");
export const canonicalAuthorizationRuleMaterial = (rule) => canonicalizeJsonResult(canonicalAuthorizationRuleJson(rule));
const encodedJson = (encoded) => encoded;
const decodeDocument = (decode, encodeRule, input, maxNodes, maxBytes) => Result.gen(function* () {
    const hostile = inspectRawJson(input, maxNodes, maxBytes);
    if (hostile !== undefined) {
        return yield* Result.fail(new InvalidIR({ message: hostile }));
    }
    const json = yield* Result.mapError(Schema.decodeUnknownResult(Schema.Json)(input), (failure) => new InvalidIR({ message: failure.message }));
    const decoded = yield* Result.mapError(decode(json), (failure) => new InvalidIR({ message: failure.message }));
    const collision = identityCollision(decoded, encodeRule);
    if (collision !== undefined) {
        return yield* Result.fail(collision);
    }
    return freezePlain(decoded);
});
const identityCollision = (document, encodeRule) => {
    if (isCatalogUnit(document)) {
        return (entityDescriptorCollisions(document.catalog.entities) ??
            traitDescriptorCollisions(document.catalog.traits) ??
            fieldDescriptorCollisions(document.catalog.fields) ??
            operationDescriptorCollisions(document.catalog.operations) ??
            traitCompositionCollisions(document.catalog.traitComposition) ??
            identityCollision(document.policy, encodeRule));
    }
    if (!isTemplate(document) && !isInstalled(document)) {
        return new InvalidIR({ message: "rejected malformed document" });
    }
    const collision = internByIdentity(document.rules.map((rule) => ({
        id: rule.id,
        body: canonicalizeJson(omitKey(encodeRule(rule), "id")),
    })), {
        collision: (id) => `rule identity collision: ${id} maps to different canonical bodies`,
        duplicate: (id) => `duplicate rule identity: ${id}`,
    }) ?? decisionCollisions(document.decisions);
    if (collision !== undefined)
        return collision;
    if (isInstalled(document)) {
        return accessPlanCollisions(document.accessPlans);
    }
    return undefined;
};
const isTemplate = (document) => typeof document === "object" &&
    document !== null &&
    document._tag === "PolicyTemplateIR";
const isInstalled = (document) => typeof document === "object" &&
    document !== null &&
    document._tag === "InstalledAuthorizationIR";
const isCatalogUnit = (document) => typeof document === "object" &&
    document !== null &&
    document._tag === "InstalledCatalogUnit";
const decisionCollisions = (decisions) => uniqueEncoded(decisions.entities.map((entry) => entry.target), "entity decision target") ??
    uniqueEncoded(decisions.traits.map((entry) => entry.target), "trait decision target") ??
    uniqueEncoded(decisions.fields.map((entry) => entry.target), "field decision target") ??
    uniqueEncoded((decisions.operations ?? []).map((entry) => entry.target), "operation decision target");
const entityDescriptorCollisions = (entities) => internByIdentity(entities.map((entity) => {
    const encoded = encodedJson(Schema.encodeUnknownSync(EntityDescriptor)(entity));
    return {
        id: canonicalizeJson(encodedJson(Schema.encodeUnknownSync(EntityId)(entity.id))),
        body: canonicalizeJson(omitKey(encoded, "id")),
    };
}), {
    collision: (id) => `entity identity collision: ${id} maps to different canonical bodies`,
    duplicate: (id) => `duplicate entity identity: ${id}`,
});
const traitDescriptorCollisions = (traits) => internByIdentity(traits.map((trait) => {
    const encoded = encodedJson(Schema.encodeUnknownSync(TraitDescriptor)(trait));
    return {
        id: canonicalizeJson(encodedJson(Schema.encodeUnknownSync(TraitId)(trait.id))),
        body: canonicalizeJson(omitKey(encoded, "id")),
    };
}), {
    collision: (id) => `trait identity collision: ${id} maps to different canonical bodies`,
    duplicate: (id) => `duplicate trait identity: ${id}`,
});
const fieldDescriptorCollisions = (fields) => internByIdentity(fields.map((field) => {
    const encoded = encodedJson(Schema.encodeUnknownSync(FieldDescriptor)(field));
    return {
        id: canonicalizeJson(encodedJson(Schema.encodeUnknownSync(FieldId)(field.id))),
        body: canonicalizeJson(omitKey(encoded, "id")),
    };
}), {
    collision: (id) => `field identity collision: ${id} maps to different canonical bodies`,
    duplicate: (id) => `duplicate field identity: ${id}`,
});
const operationDescriptorCollisions = (operations) => internByIdentity(operations.map((operation) => {
    const encoded = encodedJson(operation);
    return {
        id: canonicalizeJson(encodedJson(Schema.encodeUnknownSync(OperationId)(operation.id))),
        body: canonicalizeJson(omitKey(encoded, "id")),
    };
}), {
    collision: (id) => `operation identity collision: ${id} maps to different canonical bodies`,
    duplicate: (id) => `duplicate operation identity: ${id}`,
});
const traitCompositionCollisions = (compositions) => internByIdentity(compositions.map((row) => {
    const encoded = encodedJson(Schema.encodeUnknownSync(TraitComposition)(row));
    return {
        id: canonicalizeJson(omitKey(encoded, "transitive")),
        body: canonicalizeJson(ownJsonField(encoded, "transitive")),
    };
}), {
    collision: (id) => `trait-composition identity collision: ${id} maps to different canonical bodies`,
    duplicate: (id) => `duplicate trait-composition identity: ${id}`,
});
const accessPlanCollisions = (plans) => internByIdentity(plans.map((plan) => ({
    id: plan.rule,
    body: canonicalizeJson(encodedJson({ lookups: plan.lookups })),
})), {
    collision: (id) => `access-plan identity collision: ${id} maps to different canonical bodies`,
    duplicate: (id) => `duplicate access-plan identity: ${id}`,
});
const internByIdentity = (entries, labels) => {
    const bodies = new Map();
    for (const entry of entries) {
        const previous = bodies.get(entry.id);
        if (previous !== undefined && previous !== entry.body) {
            return new InvalidIR({ message: labels.collision(entry.id) });
        }
        if (previous !== undefined) {
            return new InvalidIR({ message: labels.duplicate(entry.id) });
        }
        bodies.set(entry.id, entry.body);
    }
    return undefined;
};
const uniqueEncoded = (values, label) => {
    const seen = new Set();
    for (const value of values) {
        const key = canonicalizeJson(encodedJson(value));
        if (seen.has(key)) {
            return new InvalidIR({ message: `duplicate ${label}` });
        }
        seen.add(key);
    }
    return undefined;
};
const omitKey = (encoded, key) => {
    if (typeof encoded !== "object" || encoded === null || Array.isArray(encoded)) {
        return encoded;
    }
    const body = Object.create(null);
    for (const name of Object.keys(encoded)) {
        if (name !== key)
            body[name] = ownJsonField(encoded, name);
    }
    return body;
};
const ownJsonField = (encoded, key) => {
    if (typeof encoded !== "object" || encoded === null || Array.isArray(encoded)) {
        throw new TypeError("ramose/authorization: expected JSON object");
    }
    const descriptor = Object.getOwnPropertyDescriptor(encoded, key);
    if (descriptor === undefined || descriptor.get !== undefined) {
        throw new TypeError("ramose/authorization: expected own JSON data");
    }
    return descriptor.value;
};
const inspectRawJson = (input, maxNodes = MAX_JSON_NODES, maxBytes = MAX_JSON_ENCODED_BYTES) => {
    const work = { nodes: 0, bytes: 0, maxNodes, maxBytes };
    const root = jsonLeafViolation(input, work);
    if (root !== undefined)
        return root;
    if (typeof input !== "object" || input === null)
        return undefined;
    const seen = new WeakMap();
    const stack = [];
    const opened = enterObject(input, 0, seen, stack, work);
    if (opened !== undefined)
        return opened;
    while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const next = nextChild(frame);
        if (next === undefined) {
            seen.set(frame.value, true);
            stack.pop();
            continue;
        }
        if (next.violation !== undefined)
            return next.violation;
        const leaf = jsonLeafViolation(next.value, work);
        if (leaf !== undefined)
            return leaf;
        if (typeof next.value === "object" && next.value !== null) {
            const reason = enterObject(next.value, frame.depth + 1, seen, stack, work);
            if (reason !== undefined)
                return reason;
        }
    }
    return undefined;
};
const charge = (work, nodes, bytes) => {
    work.nodes += nodes;
    work.bytes += bytes;
    if (work.nodes > work.maxNodes || work.bytes > work.maxBytes) {
        return "rejected oversized document";
    }
    return undefined;
};
const enterObject = (value, depth, seen, stack, work) => {
    const cached = seen.get(value);
    if (cached === false)
        return "rejected cycle";
    if (cached === true)
        return "rejected alias";
    if (depth > MAX_JSON_DEPTH)
        return "rejected oversized depth";
    const shape = objectShapeViolation(value, work);
    if (shape !== undefined)
        return shape;
    seen.set(value, false);
    if (Array.isArray(value)) {
        stack.push({ value, keys: value.length, index: 0, depth });
    }
    else {
        stack.push({
            value,
            keys: Object.getOwnPropertyNames(value),
            index: 0,
            depth,
        });
    }
    return undefined;
};
const nextChild = (frame) => {
    if (typeof frame.keys === "number") {
        if (frame.index >= frame.keys)
            return undefined;
        const name = String(frame.index++);
        return childFromDescriptor(frame.value, name, true);
    }
    if (frame.index >= frame.keys.length)
        return undefined;
    return childFromDescriptor(frame.value, frame.keys[frame.index++], false);
};
const childFromDescriptor = (value, name, arrayIndex) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (descriptor === undefined) {
        return { violation: arrayIndex ? "rejected undefined" : "rejected prototype" };
    }
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
        return { violation: "rejected prototype" };
    }
    return { value: descriptor.value };
};
const objectShapeViolation = (value, work) => {
    if (Array.isArray(value)) {
        if (value.length > MAX_COLLECTION_SIZE)
            return "rejected oversized collection";
        if (Object.getPrototypeOf(value) !== Array.prototype)
            return "rejected prototype";
        if (Object.getOwnPropertySymbols(value).length > 0)
            return "rejected symbol";
        for (const name of Object.getOwnPropertyNames(value)) {
            if (name === "length")
                continue;
            if (!/^(0|[1-9]\d*)$/.test(name))
                return "rejected non-JSON array";
            const index = Number(name);
            if (!Number.isInteger(index) || index < 0 || index >= value.length) {
                return "rejected non-JSON array";
            }
        }
        return charge(work, 1, 0);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== Object.prototype) {
        return "rejected prototype";
    }
    const names = Object.getOwnPropertyNames(value);
    if (names.length > MAX_COLLECTION_SIZE)
        return "rejected oversized collection";
    if (Object.getOwnPropertySymbols(value).length > 0)
        return "rejected symbol";
    const objectCharge = charge(work, 1, 0);
    if (objectCharge !== undefined)
        return objectCharge;
    for (const name of names) {
        if (name.length > MAX_STRING_LENGTH)
            return "rejected oversized string";
        if (hasLoneSurrogate(name))
            return "rejected unicode";
        const keyCharge = charge(work, 1, UTF8.encode(name).byteLength);
        if (keyCharge !== undefined)
            return keyCharge;
    }
    return undefined;
};
const jsonLeafViolation = (value, work) => {
    if (value === undefined)
        return "rejected undefined";
    if (typeof value === "function")
        return "rejected function";
    if (typeof value === "symbol")
        return "rejected symbol";
    if (typeof value === "bigint")
        return "rejected bigint";
    if (typeof value === "number") {
        if (Number.isNaN(value))
            return "rejected NaN";
        if (!Number.isFinite(value))
            return "rejected Infinity";
        return charge(work, 1, stringLengthOfNumber(value));
    }
    if (typeof value === "string") {
        if (value.length > MAX_STRING_LENGTH)
            return "rejected oversized string";
        if (hasLoneSurrogate(value))
            return "rejected unicode";
        return charge(work, 1, UTF8.encode(value).byteLength);
    }
    if (value === null)
        return charge(work, 1, 4);
    if (typeof value === "boolean")
        return charge(work, 1, value ? 4 : 5);
    return undefined;
};
const stringLengthOfNumber = (value) => Object.is(value, -0) || value === 0 ? 1 : String(value).length;
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
//# sourceMappingURL=decode.js.map