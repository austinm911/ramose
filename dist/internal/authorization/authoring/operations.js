import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import { isOwnedOperation, OwnedOperations, } from "../../../db/Operation.js";
import { assertEntityTraitNames, reachableTraits, walkTraits, } from "../../../db/compose.js";
import { bindDeployedSchema, } from "../../../db/deployedSchema.js";
import { isSelfRefSchema, refTargetOf, tryInferDbValueType, } from "../../../db/valueTypes.js";
import { InvalidIR } from "../failures.js";
import { CatalogId, EntityId, OperationId, TraitId, } from "../identities.js";
import { OperationDescriptor, } from "../catalog.js";
import { hashDomainSeparatedCanonicalJson, } from "../decode.js";
import { hashOperationVersion, requireOperationRevision, } from "../operation-version.js";
const OPERATION_SCHEMA_HASH_DOMAIN_V1 = "ramose/operation-schema/v1\0";
const OPERATION_IMPLEMENTATION_HASH_DOMAIN_V1 = "ramose/operation-implementation/v1\0";
const invalid = (message) => new InvalidIR({ message });
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const ownerRefOf = (owner) => ({
    kind: owner._tag === "Entity" ? "entity" : "trait",
    name: owner.ns,
});
const definitionKey = (owner, localName) => `${owner.kind}\0${owner.name}\0${localName}`;
const operationLabel = (owner, localName) => `${owner.kind} '${owner.name}.${localName}'`;
const hasCodec = (value) => typeof value === "object" && value !== null &&
    typeof value.decode === "function" &&
    typeof value.encode === "function";
export const pairDeployedOperations = (descriptors, definitions) => Result.gen(function* () {
    const byKey = new Map();
    for (const definition of definitions) {
        const key = definitionKey(definition.owner, definition.localName);
        if (byKey.has(key)) {
            return yield* Result.fail(invalid(`duplicate deployed operation binding for ${operationLabel(definition.owner, definition.localName)}`));
        }
        if (!hasCodec(definition.input) || !hasCodec(definition.output)) {
            return yield* Result.fail(invalid(`missing deployed operation codec for ${operationLabel(definition.owner, definition.localName)}`));
        }
        if (typeof definition.run !== "function") {
            return yield* Result.fail(invalid(`missing deployed operation executable for ${operationLabel(definition.owner, definition.localName)}`));
        }
        byKey.set(key, definition);
    }
    const paired = [];
    const descriptorKeys = new Set();
    for (const descriptor of descriptors) {
        const key = definitionKey(descriptor.id.owner, descriptor.id.localName);
        if (descriptorKeys.has(key)) {
            return yield* Result.fail(invalid(`duplicate operation descriptor for ${operationLabel(descriptor.id.owner, descriptor.id.localName)}`));
        }
        descriptorKeys.add(key);
        const definition = byKey.get(key);
        if (definition === undefined) {
            return yield* Result.fail(invalid(`missing deployed operation binding for ${operationLabel(descriptor.id.owner, descriptor.id.localName)}`));
        }
        if (definition.id.catalog !== descriptor.id.catalog ||
            definition.id.owner.kind !== descriptor.id.owner.kind ||
            definition.id.owner.name !== descriptor.id.owner.name ||
            definition.id.localName !== descriptor.id.localName ||
            definition.id.target !== descriptor.id.target ||
            (definition.self ? "required" : "none") !== descriptor.id.target ||
            definition.inputSchemaHash !== descriptor.inputSchemaHash ||
            definition.outputSchemaHash !== descriptor.outputSchemaHash ||
            definition.implementationHash !== descriptor.bodyHash) {
            return yield* Result.fail(invalid(`mismatched deployed operation binding for ${operationLabel(descriptor.id.owner, descriptor.id.localName)}`));
        }
        byKey.delete(key);
        paired.push(Object.freeze({
            descriptor,
            input: definition.input,
            output: definition.output,
            inputWireShape: definition.inputWireShape,
            run: definition.run,
            entityDefinitions: definition.entityDefinitions,
        }));
    }
    const extra = byKey.values().next().value;
    if (extra !== undefined) {
        return yield* Result.fail(invalid(`deployed operation binding has no descriptor for ${operationLabel(extra.owner, extra.localName)}`));
    }
    return Object.freeze(paired);
});
const operationsOf = (owner) => owner[OwnedOperations] ?? {};
const collectOwners = (schemas) => {
    const entities = new Map();
    for (const schema of schemas) {
        for (const entity of Object.values(schema.entities)) {
            const previous = entities.get(entity.ns);
            if (previous !== undefined && previous !== entity) {
                return Result.fail(invalid(`duplicate entity definition '${entity.ns}'`));
            }
            entities.set(entity.ns, entity);
        }
    }
    try {
        const traits = reachableTraits(entities.values());
        assertEntityTraitNames(entities.keys(), traits);
        return Result.succeed({
            entities: [...entities.values()].sort((left, right) => compareText(left.ns, right.ns)),
            traits,
        });
    }
    catch (cause) {
        return Result.fail(invalid(cause instanceof Error ? cause.message : String(cause)));
    }
};
const composerEntities = (trait, entities) => entities.filter((entity) => walkTraits(entity.traits).all.some((candidate) => candidate === trait));
const collectDrafts = (schemas) => Result.gen(function* () {
    const { entities, traits } = yield* collectOwners(schemas);
    const drafts = [];
    const seen = new Map();
    const writeDefinitions = new Map(entities.map((entity) => [entity.ns, entity]));
    const collect = (owner, composers) => {
        for (const localName of Object.keys(operationsOf(owner)).sort(compareText)) {
            const candidate = operationsOf(owner)[localName];
            if (!isOwnedOperation(candidate)) {
                return Result.fail(invalid(`malformed operation '${owner.ns}.${localName}'`));
            }
            if (candidate.owner !== owner || candidate.localName !== localName) {
                return Result.fail(invalid(`conflicting operation binding '${owner.ns}.${localName}'`));
            }
            const localWrites = new Set();
            for (const entity of candidate.writes) {
                if (localWrites.has(entity.ns)) {
                    return Result.fail(invalid(`duplicate write definition '${entity.ns}' in operation '${owner.ns}.${localName}'`));
                }
                localWrites.add(entity.ns);
                const previousDefinition = writeDefinitions.get(entity.ns);
                if (previousDefinition !== undefined && previousDefinition !== entity) {
                    return Result.fail(invalid(`conflicting write definition '${entity.ns}' in operation '${owner.ns}.${localName}'`));
                }
                writeDefinitions.set(entity.ns, entity);
            }
            const ownerRef = ownerRefOf(owner);
            const key = definitionKey(ownerRef, localName);
            const previous = seen.get(key);
            if (previous !== undefined) {
                if (previous !== candidate) {
                    return Result.fail(invalid(`duplicate operation identity '${owner.ns}.${localName}'`));
                }
                continue;
            }
            seen.set(key, candidate);
            drafts.push({ operation: candidate, owner, ownerRef, localName, composers });
        }
        return Result.succeed(undefined);
    };
    for (const entity of entities)
        yield* collect(entity, []);
    for (const trait of [...traits.values()].sort((left, right) => compareText(left.ns, right.ns))) {
        yield* collect(trait, composerEntities(trait, entities));
    }
    return drafts;
});
const refShape = (catalog, schema) => {
    if (isSelfRefSchema(schema)) {
        return { _tag: "ref", refTarget: { _tag: "self" } };
    }
    const resolve = refTargetOf(schema);
    if (resolve === undefined) {
        return { _tag: "ref", refTarget: { _tag: "untargeted" } };
    }
    const target = resolve();
    if (target.ns === undefined) {
        return { _tag: "ref", refTarget: { _tag: "untargeted" } };
    }
    const refTarget = target._tag === "Trait"
        ? { _tag: "trait", trait: TraitId.make({ catalog, name: target.ns }) }
        : { _tag: "entity", entity: EntityId.make({ catalog, name: target.ns }) };
    return { _tag: "ref", refTarget };
};
const primitiveShape = (ast) => {
    const type = SchemaAST.toType(ast);
    switch (type._tag) {
        case "String":
        case "TemplateLiteral":
            return { _tag: "scalar", valueType: "string" };
        case "Number":
            return { _tag: "scalar", valueType: "double" };
        case "Boolean":
            return { _tag: "scalar", valueType: "boolean" };
        case "Literal":
            return typeof type.literal === "string"
                ? { _tag: "scalar", valueType: "string" }
                : typeof type.literal === "number"
                    ? { _tag: "scalar", valueType: "double" }
                    : typeof type.literal === "boolean"
                        ? { _tag: "scalar", valueType: "boolean" }
                        : undefined;
        case "Enum": {
            const kinds = new Set(type.enums.map(([, value]) => typeof value));
            return kinds.size === 1 && kinds.has("string")
                ? { _tag: "scalar", valueType: "string" }
                : kinds.size === 1 && kinds.has("number")
                    ? { _tag: "scalar", valueType: "double" }
                    : undefined;
        }
        default:
            return undefined;
    }
};
const unwrapPropertySchema = (schema) => {
    let current = schema;
    const seen = new Set();
    while (SchemaAST.isOptional(current.ast) && !seen.has(current)) {
        seen.add(current);
        const inner = current.schema;
        if (!Schema.isSchema(inner))
            break;
        current = inner;
    }
    return current;
};
const isRamoseRefIdentifier = (value) => value === "ramose/ref" || value === "ramose/ref-self";
const astHasRamoseRefMarker = (ast) => {
    const node = ast;
    return (isRamoseRefIdentifier(node.annotations?.identifier) ||
        node.checks?.some((check) => isRamoseRefIdentifier(check.annotations?.identifier)) === true);
};
const astChildren = (ast) => {
    const children = [];
    const seen = new WeakSet([ast]);
    const isAst = (value) => value["~effect/Schema"] ===
        "~effect/Schema" &&
        typeof value._tag === "string";
    const visit = (value) => {
        if (typeof value !== "object" || value === null || seen.has(value))
            return;
        if (isAst(value)) {
            children.push(value);
            return;
        }
        seen.add(value);
        for (const child of Object.values(value))
            visit(child);
    };
    for (const [key, value] of Object.entries(ast)) {
        if (key === "annotations" || key === "checks" || key === "context")
            continue;
        visit(value);
    }
    return children;
};
const astContainsRamoseRef = (ast, active = new Set()) => {
    if (active.has(ast))
        return false;
    const next = new Set(active).add(ast);
    if (astHasRamoseRefMarker(ast))
        return true;
    return astChildren(ast).some((child) => astContainsRamoseRef(child, next));
};
const astContainsSuspend = (ast, active = new Set()) => {
    if (active.has(ast))
        return false;
    if (ast._tag === "Suspend")
        return true;
    const next = new Set(active).add(ast);
    return astChildren(ast).some((child) => astContainsSuspend(child, next));
};
const schemaContainsRamoseRef = (schema, active = new Set()) => {
    schema = unwrapPropertySchema(schema);
    if (active.has(schema))
        return false;
    if (tryInferDbValueType(schema) === "ref")
        return true;
    if (astContainsRamoseRef(schema.ast))
        return true;
    const next = new Set(active).add(schema);
    const node = schema;
    return [
        ...Object.values(node.fields ?? {}),
        ...(node.value === undefined ? [] : [node.value]),
        ...(node.members ?? []),
        ...(node.elements ?? []),
        ...(node.rest ?? []),
        ...(node.from === undefined ? [] : [node.from]),
        ...(node.to === undefined ? [] : [node.to]),
    ].some((child) => schemaContainsRamoseRef(child, next));
};
export const lowerOperationSchema = (catalog, schema, active = new Set()) => {
    schema = unwrapPropertySchema(schema);
    if (active.has(schema))
        return { _tag: "opaque" };
    if (schema.ast._tag === "Suspend") {
        throw new Error("suspended operation schemas cannot be lowered");
    }
    const next = new Set(active).add(schema);
    const valueType = tryInferDbValueType(schema);
    if (valueType === "ref")
        return refShape(catalog, schema);
    if (astHasRamoseRefMarker(schema.ast)) {
        throw new Error(`refs wrapped by an unsupported ${SchemaAST.toType(schema.ast)._tag} operation schema cannot be lowered`);
    }
    if (valueType !== undefined) {
        return { _tag: "scalar", valueType };
    }
    const record = schema;
    if (record.fields !== undefined) {
        const keys = Reflect.ownKeys(record.fields);
        if (keys.some((key) => typeof key !== "string")) {
            throw new Error("operation structs with symbol keys cannot be lowered");
        }
        return {
            _tag: "struct",
            fields: keys.sort(compareText).map((key) => {
                const field = record.fields[key];
                return {
                    key,
                    optional: SchemaAST.isOptional(field.ast),
                    shape: lowerOperationSchema(catalog, field, next),
                };
            }),
        };
    }
    if (record.value !== undefined && SchemaAST.toType(schema.ast)._tag === "Arrays") {
        return {
            _tag: "array",
            items: lowerOperationSchema(catalog, record.value, next),
        };
    }
    if (record.to !== undefined && record.to !== schema) {
        return lowerOperationSchema(catalog, record.to, next);
    }
    if (astContainsSuspend(schema.ast)) {
        throw new Error(`suspended schemas nested inside an unsupported ${SchemaAST.toType(schema.ast)._tag} operation schema cannot be lowered`);
    }
    if (schemaContainsRamoseRef(schema)) {
        throw new Error(`refs nested inside an unsupported ${SchemaAST.toType(schema.ast)._tag} operation schema cannot be lowered`);
    }
    return primitiveShape(schema.ast) ?? { _tag: "opaque" };
};
const refDepths = (shape, prefix, into) => {
    switch (shape._tag) {
        case "ref":
            into.push(prefix);
            break;
        case "array":
            refDepths(shape.items, `${prefix}[]`, into);
            break;
        case "struct":
            for (const field of shape.fields)
                refDepths(field.shape, `${prefix}*`, into);
            break;
        default:
            break;
    }
    return into;
};
const sameRefDepths = (wire, decoded) => {
    const left = [...refDepths(wire, "", [])].sort(compareText);
    const right = [...refDepths(decoded, "", [])].sort(compareText);
    return left.length === right.length &&
        left.every((depth, index) => depth === right[index]);
};
export const lowerOperationWireShape = (catalog, schema, active = new Set()) => {
    schema = unwrapPropertySchema(schema);
    if (active.has(schema))
        return { _tag: "opaque" };
    const next = new Set(active).add(schema);
    if (tryInferDbValueType(schema) === "ref" || astHasRamoseRefMarker(schema.ast))
        return { _tag: "ref" };
    const record = schema;
    if (record.fields !== undefined) {
        const keys = Reflect.ownKeys(record.fields);
        if (keys.some((key) => typeof key !== "string"))
            return { _tag: "opaque" };
        return {
            _tag: "struct",
            fields: keys.sort(compareText).map((key) => ({
                key,
                shape: lowerOperationWireShape(catalog, record.fields[key], next),
            })),
        };
    }
    if (record.value !== undefined && SchemaAST.toType(schema.ast)._tag === "Arrays") {
        return {
            _tag: "array",
            items: lowerOperationWireShape(catalog, record.value, next),
        };
    }
    if (record.from !== undefined && record.to !== undefined && record.to !== schema) {
        const wire = lowerOperationWireShape(catalog, record.from, next);
        let decoded;
        try {
            decoded = lowerOperationSchema(catalog, record.to, next);
        }
        catch {
            return { _tag: "opaque" };
        }
        return sameRefDepths(wire, decoded) ? wire : decoded;
    }
    const source = record.schema;
    if (Schema.isSchema(source) && source !== schema &&
        SchemaAST.toType(source.ast)._tag === SchemaAST.toType(schema.ast)._tag)
        return lowerOperationWireShape(catalog, source, next);
    return primitiveShape(schema.ast) === undefined
        ? { _tag: "opaque" }
        : { _tag: "scalar" };
};
const shapeContainsSelf = (shape) => {
    switch (shape._tag) {
        case "scalar":
        case "opaque":
            return false;
        case "ref":
            return shape.refTarget._tag === "self";
        case "array":
            return shapeContainsSelf(shape.items);
        case "struct":
            return shape.fields.some((field) => shapeContainsSelf(field.shape));
    }
};
const schemaHashMaterial = (catalog, schema, representation, artifactHash) => {
    try {
        return Result.succeed({
            representation,
            ramoseShape: lowerOperationSchema(catalog, schema),
            artifactHash,
        });
    }
    catch (cause) {
        return Result.fail(invalid(`operation schema lowering failed: ${cause instanceof Error ? cause.message : String(cause)}`));
    }
};
const hashOperationSchema = Effect.fn("Authorization.hashOperationSchema")(function* (material) {
    return yield* hashDomainSeparatedCanonicalJson(OPERATION_SCHEMA_HASH_DOMAIN_V1, material);
});
const freeze = (value) => Object.freeze(value);
const runtimeEntityDefinition = (entity) => Object.freeze({
    ns: entity.ns,
    fields: Object.freeze(Object.fromEntries(Object.entries(entity.fields).map(([key, field]) => [key, Object.freeze({
            ident: field.ident,
            cardinality: field.cardinality,
            valueType: field.valueType,
            ...(field.unique === undefined ? {} : { unique: field.unique }),
        })]))),
});
const deepFreeze = (value, seen = new WeakSet()) => {
    if ((typeof value !== "object" && typeof value !== "function") || value === null) {
        return value;
    }
    const object = value;
    if (seen.has(object))
        return value;
    seen.add(object);
    for (const child of Object.values(object))
        deepFreeze(child, seen);
    return Object.freeze(value);
};
export const snapshotOwnedOperations = (catalog, schemas, artifactHash) => Result.gen(function* () {
    const drafts = yield* collectDrafts(schemas);
    const { entities } = yield* collectOwners(schemas);
    const entityDefinitions = Object.freeze(entities.map(runtimeEntityDefinition));
    const snapshots = [];
    for (const draft of drafts) {
        const operation = draft.operation;
        const id = OperationId.make({
            catalog,
            owner: draft.ownerRef,
            localName: draft.localName,
            target: operation.self ? "required" : "none",
        });
        let inputSchemaBinding;
        let outputSchemaBinding;
        try {
            inputSchemaBinding = bindDeployedSchema(operation.input);
            outputSchemaBinding = bindDeployedSchema(operation.output);
        }
        catch (cause) {
            return yield* Result.fail(invalid(`operation schema binding failed for '${draft.owner.ns}.${draft.localName}': ${cause instanceof Error ? cause.message : String(cause)}`));
        }
        const inputSchemaMaterial = yield* schemaHashMaterial(catalog, operation.input, inputSchemaBinding.projection, artifactHash);
        const outputSchemaMaterial = yield* schemaHashMaterial(catalog, operation.output, outputSchemaBinding.projection, artifactHash);
        const inputShape = lowerOperationSchema(catalog, operation.input);
        const outputShape = lowerOperationSchema(catalog, operation.output);
        if (!operation.self &&
            (shapeContainsSelf(inputShape) || shapeContainsSelf(outputShape))) {
            return yield* Result.fail(invalid(`targetless operation '${draft.owner.ns}.${draft.localName}' cannot reference self`));
        }
        const writes = Object.freeze(operation.writes.map((entity) => deepFreeze(EntityId.make({ catalog, name: entity.ns }))));
        const composers = Object.freeze(draft.owner._tag === "Trait" && operation.self
            ? draft.composers.map((entity) => deepFreeze(EntityId.make({ catalog, name: entity.ns })))
            : []);
        let revision;
        try {
            revision = requireOperationRevision(operation.revision, `${draft.owner.ns}.${draft.localName}`);
        }
        catch (cause) {
            return yield* Result.fail(invalid(cause instanceof Error ? cause.message : String(cause)));
        }
        snapshots.push(freeze({
            id: deepFreeze(id),
            owner: deepFreeze({ ...draft.ownerRef }),
            localName: draft.localName,
            self: operation.self,
            writes,
            composers,
            revision,
            versionDescriptor: deepFreeze({
                catalog,
                owner: { ...draft.ownerRef },
                localName: draft.localName,
                target: operation.self ? "required" : "none",
                revision,
                input: {
                    representation: inputSchemaBinding.projection,
                    shape: inputShape,
                },
                output: {
                    representation: outputSchemaBinding.projection,
                    shape: outputShape,
                },
                composers: composers.map((entity) => entity.name),
                writes: writes.map((entity) => entity.name),
                allocations: operation.allocations ?? [],
            }),
            inputShape: deepFreeze(inputShape),
            inputWireShape: deepFreeze(lowerOperationWireShape(catalog, operation.input)),
            outputShape: deepFreeze(outputShape),
            inputSchemaMaterial: deepFreeze(inputSchemaMaterial),
            outputSchemaMaterial: deepFreeze(outputSchemaMaterial),
            inputCodec: deepFreeze(inputSchemaBinding.codec),
            outputCodec: deepFreeze(outputSchemaBinding.codec),
            doc: operation.doc,
            run: operation.run,
            entityDefinitions,
            implementationHashMaterial: deepFreeze({
                artifactHash,
                operation: id,
            }),
        }));
    }
    return Object.freeze(snapshots);
});
export const lowerOwnedOperationSnapshots = Effect.fn("Authorization.lowerOwnedOperationSnapshots")(function* (snapshots) {
    const descriptors = [];
    const definitions = [];
    for (const snapshot of snapshots) {
        const [inputSchemaHash, outputSchemaHash, implementationHash, version] = yield* Effect.all([
            hashOperationSchema(snapshot.inputSchemaMaterial),
            hashOperationSchema(snapshot.outputSchemaMaterial),
            hashDomainSeparatedCanonicalJson(OPERATION_IMPLEMENTATION_HASH_DOMAIN_V1, snapshot.implementationHashMaterial),
            hashOperationVersion(snapshot.versionDescriptor),
        ]);
        const descriptorInput = {
            id: snapshot.id,
            input: snapshot.inputShape,
            output: snapshot.outputShape,
            version,
            revision: snapshot.revision,
            inputSchemaHash,
            outputSchemaHash,
            bodyHash: implementationHash,
            composers: snapshot.composers,
            writes: snapshot.writes,
            ...(snapshot.versionDescriptor.allocations.length === 0 ? {} : {
                allocations: snapshot.versionDescriptor.allocations.map((allocation) => ({ slot: allocation.slot, path: [...allocation.path] })),
            }),
            ...(snapshot.doc === undefined ? {} : { doc: snapshot.doc }),
        };
        const descriptor = yield* Effect.fromResult(Result.mapError(Schema.decodeResult(OperationDescriptor)(descriptorInput), (failure) => invalid(`invalid lowered operation: ${failure.message}`)));
        descriptors.push(freeze(descriptor));
        definitions.push(freeze({
            id: snapshot.id,
            owner: snapshot.owner,
            localName: snapshot.localName,
            self: snapshot.self,
            writes: snapshot.writes,
            input: snapshot.inputCodec,
            output: snapshot.outputCodec,
            inputWireShape: snapshot.inputWireShape,
            inputSchemaHash,
            outputSchemaHash,
            doc: snapshot.doc,
            implementationHash,
            run: snapshot.run,
            entityDefinitions: snapshot.entityDefinitions,
        }));
    }
    return freeze({
        descriptors: Object.freeze(descriptors),
        definitions: Object.freeze(definitions),
    });
});
export const lowerOwnedOperations = Effect.fn("Authorization.lowerOwnedOperations")(function* (catalog, input, artifactHash) {
    const schemas = Array.isArray(input) ? input : [input];
    const snapshots = yield* Effect.fromResult(snapshotOwnedOperations(catalog, schemas, artifactHash));
    return yield* lowerOwnedOperationSnapshots(snapshots);
});
//# sourceMappingURL=operations.js.map