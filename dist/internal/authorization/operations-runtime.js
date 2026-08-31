import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { InvalidRequest, OperationRejected, Unauthorized, } from "../../db/Errors.js";
import { cloneBindingValue } from "../../db/Binding.js";
import { sha256Hex } from "../core/bytes.js";
import { isQueryObject, tryLowerQueryObject, } from "../../db/query/query.js";
import { lowerAttr } from "../../db/attrRef.js";
import { asLookupRef, lowerEntityArg, lowerWriteValue, tempid, } from "../../db/entityArg.js";
import { markEngineTypeAssertion } from "../core/tx-provenance.js";
import { Index } from "../core/datom.js";
import { toWireDatom } from "../core/log.js";
import { query } from "../core/query/engine.js";
import { pull } from "../core/query/pull.js";
import { RAMOSE_TYPE, RAMOSE_TYPE_IDENT } from "../core/schema.js";
import { toJson } from "../core/json.js";
import { requireCatalogKey, requireUnitHash, } from "./deployed.js";
import { resolveDeployedCatalogDefinition, } from "./definitions.js";
import { deriveResolvedDatabaseRoute, resolveBoundCatalogDefinition, } from "./database-bindings.js";
import { operationGrantAllows } from "./operation-grant.js";
import { canonicalizeJson } from "./canonical-json.js";
import { constructAuthorizedRequestContext, constructAuthorizedResolvedRequestContext, } from "./request.js";
import { compileReadFilter, uniqueCanonicalTypeName, } from "./read-filter.js";
import { allocatedEids, extractAllocations, sealAllocationMappings, } from "./entity-targets.js";
const REPLAY_AUTHORIZATION_DIGEST_DOMAIN = "ramose/operation-replay-authorization/v1\0";
const UTF8 = new TextEncoder();
const OPERATION_ADMISSION = Symbol("ramose.operation-admission");
export const resolveOperationCatalog = Effect.fn("Authorization.resolveOperationCatalog")(function* (runtime, invocation) {
    if (invocation.routeDerivation === undefined) {
        const deployed = resolveDeployedCatalogDefinition(runtime.catalogs, {
            database: invocation.database,
            catalogKey: invocation.catalogKey,
            unitHash: invocation.unitHash,
        });
        if (Result.isFailure(deployed))
            return yield* deny();
        return Object.freeze({ deployed: deployed.success });
    }
    if (runtime.bindings === undefined ||
        !Array.isArray(invocation.routeDerivation.graphs)) {
        return yield* deny();
    }
    const route = yield* deriveResolvedDatabaseRoute(runtime.bindings, invocation.routeDerivation).pipe(Effect.mapError(() => deny()));
    if (route.database !== invocation.database ||
        route.deployed.catalogKey !== invocation.catalogKey ||
        route.deployed.unitHash !== invocation.unitHash) {
        return yield* deny();
    }
    const deployed = yield* Effect.fromResult(resolveBoundCatalogDefinition(runtime.bindings, route)).pipe(Effect.mapError(() => deny()));
    return Object.freeze({ deployed, route });
});
export class OperationRuntimeFault extends Error {
    stage;
    detail;
    constructor(stage, detail) {
        super("operation execution failed");
        this.name = "OperationRuntimeFault";
        this.stage = stage;
        this.detail = detail;
    }
}
export const opaqueOperationDenial = () => new Unauthorized({ status: 403 });
const deny = opaqueOperationDenial;
const operationLabel = (descriptor) => `${descriptor.id.owner.name}/${descriptor.id.localName}`;
const rejected = (descriptor, message, step, reason) => new OperationRejected({
    message,
    operation: operationLabel(descriptor),
    ...(step === undefined ? {} : { step }),
    ...(reason === undefined ? {} : { reason }),
});
const requireFreshAuthorization = (runtime, expiresAtSeconds, descriptor) => {
    let now;
    try {
        now = runtime.now();
    }
    catch (cause) {
        throw new OperationRuntimeFault("clock", cause);
    }
    if (!Number.isFinite(now)) {
        throw rejected(descriptor, "authoritative operation clock is invalid");
    }
    if (!Number.isSafeInteger(expiresAtSeconds) || expiresAtSeconds * 1_000 <= now) {
        throw deny();
    }
    return now;
};
const descriptorKey = (owner, localName) => `${owner.kind}\0${owner.name}\0${localName}`;
const bindingFor = (definition, owner, localName) => definition.operations.find((binding) => descriptorKey(binding.descriptor.id.owner, binding.descriptor.id.localName) ===
    descriptorKey(owner, localName));
export const deployedOperationVersion = (resolved, owner, localName) => bindingFor(resolved.deployed.definition, owner, localName)?.descriptor.version;
export const deployedOperationOutputShape = (resolved, owner, localName) => bindingFor(resolved.deployed.definition, owner, localName)?.descriptor.output;
export const deployedOperationInputWireShape = (resolved, owner, localName) => bindingFor(resolved.deployed.definition, owner, localName)?.inputWireShape;
const fieldIdent = (field) => `:${field.id.owner.name}/${field.id.localName}`;
const validateOperationFieldValue = (definition, ident, value) => {
    try {
        definition.validateFieldValue(ident, value);
    }
    catch (cause) {
        if (cause instanceof Schema.SchemaError) {
            throw new InvalidRequest({
                message: `invalid operation value for ${ident}: ${cause.message}`,
            });
        }
        throw new OperationRuntimeFault("field", cause);
    }
};
const fieldTables = (definition) => {
    const byIdent = new Map();
    for (const field of definition.unit.catalog.fields)
        byIdent.set(fieldIdent(field), field);
    return byIdent;
};
const typeName = async (db, eid) => {
    const datoms = await db.datomsArray(Index.EAVT, { e: eid, a: RAMOSE_TYPE });
    return uniqueCanonicalTypeName(datoms);
};
const typeCompatible = (definition, owner, concrete) => owner.kind === "entity"
    ? concrete === owner.name
    : definition.composition.transitiveTraits(`:${concrete}`).includes(`:${owner.name}`);
const refCompatible = (definition, target, concrete, selfType) => {
    switch (target._tag) {
        case "entity":
            return concrete === target.entity.name;
        case "trait":
            return definition.composition.transitiveTraits(`:${concrete}`).includes(`:${target.trait.name}`);
        case "self":
            return selfType !== undefined && concrete === selfType;
        case "untargeted":
            return definition.composition.isEntityIdent(`:${concrete}`);
    }
};
const resolveVisibleTarget = async (context, target) => {
    const eid = typeof target === "number" ? target : await context.filteredDb.entid(target);
    if (eid === undefined || !(await context.filteredDb.exists(eid)))
        return undefined;
    const concrete = await typeName(context.currentDb, eid);
    return concrete === undefined ? undefined : { eid, type: concrete };
};
const sameValue = (left, right) => {
    if (Object.is(left, right))
        return true;
    if (left instanceof Date && right instanceof Date)
        return left.getTime() === right.getTime();
    if (left instanceof Uint8Array && right instanceof Uint8Array) {
        return left.length === right.length && left.every((value, index) => value === right[index]);
    }
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
    }
    return false;
};
const isPlainRecord = (value) => {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};
const sameTransportValue = (left, right, seen = new WeakMap()) => {
    if (sameValue(left, right))
        return true;
    if (typeof left !== "object" || left === null ||
        typeof right !== "object" || right === null)
        return false;
    if (!(Array.isArray(left) || isPlainRecord(left)) ||
        !(Array.isArray(right) || isPlainRecord(right)) ||
        Array.isArray(left) !== Array.isArray(right))
        return false;
    const prior = seen.get(left);
    if (prior !== undefined)
        return prior === right;
    seen.set(left, right);
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length &&
            left.every((value, index) => sameTransportValue(value, right[index], seen));
    }
    const leftRecord = left;
    const rightRecord = right;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    return leftKeys.length === rightKeys.length &&
        leftKeys.every((key) => Object.hasOwn(rightRecord, key) &&
            sameTransportValue(leftRecord[key], rightRecord[key], seen));
};
const snapshotStoredValue = (descriptor, value) => {
    try {
        return cloneBindingValue(value);
    }
    catch {
        throw rejected(descriptor, "operation produced an unsupported stored value");
    }
};
const attrsOf = (value, descriptor) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw rejected(descriptor, "operation write attributes must be an object");
    }
    return value;
};
const runtimeEntity = (value) => {
    if (typeof value !== "object" || value === null)
        return undefined;
    const candidate = value;
    return typeof candidate.ns === "string" ? candidate : undefined;
};
const deployedFieldFromArgument = (definition, argument, descriptor) => {
    let ident;
    try {
        ident = lowerAttr(argument);
    }
    catch {
        throw rejected(descriptor, "operation used an invalid field");
    }
    const field = fieldTables(definition).get(ident);
    if (field === undefined)
        throw rejected(descriptor, "operation used an undeployed field");
    return field;
};
const fieldFromArgument = (definition, entityName, argument, descriptor) => {
    const field = deployedFieldFromArgument(definition, argument, descriptor);
    try {
        definition.requireFieldRuntime(entityName, fieldIdent(field));
    }
    catch {
        throw rejected(descriptor, "operation field is incompatible with its entity definition");
    }
    return field;
};
const isFieldMutable = (definition, entityName, field) => definition.requireFieldRuntime(entityName, fieldIdent(field)).fixed._tag === "mutable";
const isMany = (entity, key) => entity.fields?.[key]?.cardinality === "many";
const prepareCreationInput = (entity, values) => {
    const prepared = {};
    const deferredReferenceKeys = new Set();
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined && entity.fields?.[key]?.valueType === "ref") {
            prepared[key] = entity.fields[key]?.cardinality === "many" && Array.isArray(value)
                ? value.map(lowerWriteValue)
                : lowerWriteValue(value);
            deferredReferenceKeys.add(key);
        }
        else {
            prepared[key] = value;
        }
    }
    return {
        values: prepared,
        deferredReferenceKeys,
    };
};
const uniqueLookup = (entity, attrs) => {
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || entity.fields?.[key]?.unique !== "upsert")
            continue;
        const ident = entity.fields[key]?.ident;
        if (typeof ident === "string")
            return [ident, lowerWriteValue(value)];
    }
    return undefined;
};
const createCollector = (args) => {
    const { definition, descriptor } = args;
    const tx = [];
    const refs = [];
    const deferredFields = [];
    const subjectChecks = [];
    const deployedDefinitions = new Map(args.binding.entityDefinitions.map((entity) => [entity.ns, entity]));
    const generatedPrefix = "__ramose.operation/";
    let nextTempid = 0;
    const requireDefinition = (value) => {
        const entity = runtimeEntity(value);
        const deployed = entity === undefined ? undefined : deployedDefinitions.get(entity.ns);
        if (deployed === undefined) {
            throw rejected(descriptor, "operation used an undeployed entity definition");
        }
        return deployed;
    };
    const requireOwnerField = (argument) => {
        const concrete = args.target?.type ??
            (descriptor.id.owner.kind === "entity" ? descriptor.id.owner.name : undefined);
        const field = concrete === undefined
            ? deployedFieldFromArgument(definition, argument, descriptor)
            : fieldFromArgument(definition, concrete, argument, descriptor);
        const owner = field.id.owner;
        const allowed = owner.kind === "entity"
            ? descriptor.id.owner.kind === "entity" && owner.name === descriptor.id.owner.name
            : owner.name === descriptor.id.owner.name ||
                definition.composition.transitiveTraits(`:${descriptor.id.owner.name}`).includes(`:${owner.name}`) ||
                (descriptor.id.owner.kind === "entity" &&
                    definition.composition.transitiveTraits(`:${descriptor.id.owner.name}`).includes(`:${owner.name}`));
        if (!allowed)
            throw rejected(descriptor, "operation used a field outside its owner");
        if (concrete !== undefined && !isFieldMutable(definition, concrete, field)) {
            throw rejected(descriptor, "operation cannot mutate an engine-owned fixed field");
        }
        return field;
    };
    const appendWrite = (kind, eid, field, value, hasValue = true, deferConcreteField = false) => {
        const ident = fieldIdent(field);
        const capturedEid = snapshotStoredValue(descriptor, lowerEntityArg(eid));
        const loweredValue = hasValue ? lowerWriteValue(value) : undefined;
        const capturedValue = hasValue
            ? snapshotStoredValue(descriptor, loweredValue)
            : undefined;
        if (deferConcreteField) {
            deferredFields.push({ source: capturedEid, field });
        }
        if (hasValue && field.valueType !== "ref") {
            validateOperationFieldValue(definition, ident, loweredValue);
        }
        if (hasValue && field.valueType === "ref") {
            refs.push({
                source: capturedEid,
                field,
                target: capturedValue,
                requireTarget: kind !== "retract",
            });
        }
        if (kind === "retract") {
            tx.push(hasValue
                ? [":db/retract", capturedEid, ident, capturedValue]
                : [":db/retract", capturedEid, ident]);
            return;
        }
        tx.push([
            kind === "add" ? ":db/add" : ":db/update",
            capturedEid,
            ident,
            capturedValue,
        ]);
    };
    const makeHandle = (eid, resolveField, deferConcreteField = false, expectedOwner) => {
        const capturedEid = snapshotStoredValue(descriptor, lowerEntityArg(eid));
        const rememberSubject = () => {
            if (expectedOwner !== undefined) {
                subjectChecks.push({ source: capturedEid, owner: expectedOwner });
            }
        };
        return {
            _tag: "TxHandle",
            eid: capturedEid,
            set: (field, value) => {
                appendWrite("add", capturedEid, resolveField(field), value, true, deferConcreteField);
                rememberSubject();
            },
            remove: (field, value) => {
                appendWrite("retract", capturedEid, resolveField(field), value, value !== undefined, deferConcreteField);
                rememberSubject();
            },
            delete: () => {
                rememberSubject();
                tx.push([":db/retractEntity", capturedEid]);
            },
        };
    };
    const explicitHandle = (entity, eid) => makeHandle(eid, (argument) => {
        const field = fieldFromArgument(definition, entity.ns, argument, descriptor);
        if (!isFieldMutable(definition, entity.ns, field)) {
            throw rejected(descriptor, "operation cannot mutate an engine-owned fixed field");
        }
        return field;
    }, false, { kind: "entity", name: entity.ns });
    const ownerHandle = (eid) => makeHandle(eid, requireOwnerField, descriptor.id.owner.kind === "trait" && args.target === undefined, descriptor.id.owner);
    const addPut = (entity, eid, values, creation) => {
        let resolved;
        if (creation) {
            const prepared = prepareCreationInput(entity, values);
            resolved = definition.resolveCreationValues(entity.ns, prepared.values, { now: args.authoritativeNow }, { deferredReferenceKeys: prepared.deferredReferenceKeys });
        }
        else {
            resolved = values;
        }
        const map = {
            ":db/id": snapshotStoredValue(descriptor, lowerEntityArg(eid)),
        };
        if (!creation) {
            subjectChecks.push({
                source: map[":db/id"],
                owner: { kind: "entity", name: entity.ns },
            });
        }
        map[RAMOSE_TYPE_IDENT] = `:${entity.ns}`;
        markEngineTypeAssertion(map);
        for (const [key, value] of Object.entries(resolved)) {
            if (value === undefined)
                continue;
            const fieldArg = entity.fields?.[key];
            const field = fieldFromArgument(definition, entity.ns, fieldArg, descriptor);
            if (!creation && !isFieldMutable(definition, entity.ns, field)) {
                throw rejected(descriptor, "operation cannot mutate an engine-owned fixed field");
            }
            if (isMany(entity, key) && Array.isArray(value)) {
                for (const item of value)
                    appendWrite("add", eid, field, item);
            }
            else {
                const ident = fieldIdent(field);
                const loweredValue = lowerWriteValue(value);
                const capturedValue = snapshotStoredValue(descriptor, loweredValue);
                if (field.valueType === "ref") {
                    refs.push({
                        source: map[":db/id"],
                        field,
                        target: capturedValue,
                        requireTarget: true,
                    });
                }
                else {
                    validateOperationFieldValue(definition, ident, loweredValue);
                }
                map[ident] = capturedValue;
            }
        }
        tx.push(map);
        return explicitHandle(entity, eid);
    };
    const put = (definitionArg, a, b) => {
        const entity = requireDefinition(definitionArg);
        const creation = b === undefined || typeof lowerEntityArg(a) === "string";
        const attrs = attrsOf(b === undefined ? a : b, descriptor);
        const eid = b === undefined
            ? `${generatedPrefix}${++nextTempid}`
            : lowerEntityArg(a);
        return addPut(entity, eid, attrs, creation);
    };
    const update = (definitionArg, a, b) => {
        const entity = requireDefinition(definitionArg);
        const attrs = attrsOf(b === undefined ? a : b, descriptor);
        const eid = b === undefined ? uniqueLookup(entity, attrs) : lowerEntityArg(a);
        if (eid === undefined) {
            throw rejected(descriptor, 'update map form needs a unique: "upsert" field');
        }
        const capturedEid = snapshotStoredValue(descriptor, lowerEntityArg(eid));
        subjectChecks.push({
            source: capturedEid,
            owner: { kind: "entity", name: entity.ns },
        });
        let wrote = false;
        for (const [key, value] of Object.entries(attrs)) {
            if (value === undefined)
                continue;
            const field = fieldFromArgument(definition, entity.ns, entity.fields?.[key], descriptor);
            if (!isFieldMutable(definition, entity.ns, field)) {
                throw rejected(descriptor, "operation cannot mutate an engine-owned fixed field");
            }
            if (isMany(entity, key) && Array.isArray(value)) {
                for (const item of value)
                    appendWrite("update", capturedEid, field, item);
            }
            else {
                appendWrite("update", capturedEid, field, value);
            }
            wrote = true;
        }
        if (!wrote)
            tx.push([":db/update", capturedEid]);
        return explicitHandle(entity, capturedEid);
    };
    const principal = Object.freeze({
        eid: args.context.principal.me?.eid ?? null,
        class: args.caller.classes[0] ?? "",
        ...(typeof args.caller.claims.sub === "string"
            ? { sub: args.caller.claims.sub }
            : {}),
        claims: args.caller.claims,
    });
    const effectContext = Object.freeze({
        env: args.environment,
        principal,
    });
    const op = {
        principal,
        db: args.database,
        self: args.target === undefined ? undefined : ownerHandle(args.target.eid),
        create: descriptor.id.target === "none" && descriptor.id.owner.kind === "entity"
            ? (attrs) => {
                const entity = deployedDefinitions.get(descriptor.id.owner.name);
                if (entity === undefined) {
                    throw rejected(descriptor, "operation owner definition is unavailable");
                }
                const eid = `${generatedPrefix}${++nextTempid}`;
                return addPut(entity, eid, attrsOf(attrs, descriptor), true);
            }
            : undefined,
        entity: (...values) => {
            if (values.length === 1)
                return ownerHandle(lowerEntityArg(values[0]));
            if (values.length === 2) {
                const entity = requireDefinition(values[0]);
                return explicitHandle(entity, lowerEntityArg(values[1]));
            }
            throw rejected(descriptor, "operation entity() needs an id or a definition and id");
        },
        tempid: (name) => {
            if (name.startsWith(generatedPrefix)) {
                throw rejected(descriptor, "operation tempid uses a reserved prefix");
            }
            return tempid(name);
        },
        set: (definitionArg, eid, fieldArg, value) => {
            const entity = requireDefinition(definitionArg);
            explicitHandle(entity, lowerEntityArg(eid)).set(fieldArg, value);
        },
        remove: (definitionArg, eid, fieldArg, value) => {
            const entity = requireDefinition(definitionArg);
            explicitHandle(entity, lowerEntityArg(eid)).remove(fieldArg, value);
        },
        delete: (definitionArg, eid) => {
            const entity = requireDefinition(definitionArg);
            explicitHandle(entity, lowerEntityArg(eid)).delete();
        },
        put,
        update,
        query: async (input) => {
            if (!isQueryObject(input)) {
                throw rejected(descriptor, "operation query needs a deployed Query value");
            }
            const lowered = tryLowerQueryObject(input);
            return lowered.finalize(await query(args.context.currentDb, lowered.query));
        },
        pull: async (subject, pattern) => {
            const ref = lowerEntityArg(subject);
            const eid = typeof ref === "number"
                ? ref
                : Array.isArray(ref) && asLookupRef(ref) !== undefined
                    ? await args.context.currentDb.entid(ref)
                    : undefined;
            return eid === undefined
                ? null
                : pull(args.context.currentDb, eid, pattern);
        },
        effect: async (name, run) => {
            if (typeof name !== "string" || name.length === 0 || typeof run !== "function") {
                throw rejected(descriptor, "operation effect needs a name and native callback");
            }
            try {
                return await run(effectContext);
            }
            catch (cause) {
                if (cause instanceof Unauthorized || cause instanceof InvalidRequest ||
                    cause instanceof OperationRejected || cause instanceof OperationRuntimeFault)
                    throw cause;
                throw new OperationRuntimeFault(`effect:${name}`, cause);
            }
        },
    };
    return { op, tx, refs, deferredFields, subjectChecks };
};
const toOperationOutputJson = (value) => {
    if (value === null || value === undefined)
        return value ?? null;
    if (value instanceof Date || value instanceof Uint8Array)
        return toJson(value);
    if (typeof value === "bigint")
        return Number(value);
    if (Array.isArray(value))
        return value.map(toOperationOutputJson);
    if (value instanceof Set)
        return [...value].map(toOperationOutputJson);
    if (value instanceof Map) {
        const out = Object.create(null);
        for (const [key, item] of value)
            out[String(key)] = toOperationOutputJson(item);
        return out;
    }
    if (typeof value === "object") {
        const out = Object.create(null);
        for (const [key, item] of Object.entries(value)) {
            out[key] = toOperationOutputJson(item);
        }
        return out;
    }
    return value;
};
const materializeOutputTransport = (value) => {
    const wire = toOperationOutputJson(value);
    const text = JSON.stringify(wire);
    if (text === undefined) {
        throw new TypeError("operation output is not JSON transportable");
    }
    const materialized = JSON.parse(text);
    if (!sameTransportValue(wire, materialized)) {
        throw new TypeError("operation output changes during JSON transport");
    }
    return materialized;
};
const resolveReportLookup = async (report, lookup) => await report.dbAfter.entid(lookup) ?? await report.dbBefore.entid(lookup);
const resolveOutputHandles = async (shape, value, report) => {
    const resolve = async (input) => {
        const lowered = lowerEntityArg(input);
        if (typeof lowered === "number")
            return lowered;
        if (typeof lowered === "string") {
            const eid = report.tempids[lowered];
            if (eid !== undefined)
                return eid;
        }
        if (Array.isArray(lowered)) {
            const eid = await resolveReportLookup(report, lowered);
            if (eid !== undefined)
                return eid;
        }
        throw new InvalidRequest({ message: "operation output contains an unresolved entity handle" });
    };
    const visit = async (currentShape, current) => {
        if (currentShape._tag === "ref") {
            if (typeof current === "object" && current !== null && !Array.isArray(current) &&
                current._tag !== "TxHandle" &&
                Object.hasOwn(current, "id")) {
                return resolve(current.id);
            }
            return resolve(current);
        }
        if (currentShape._tag === "array" && Array.isArray(current)) {
            return Promise.all(current.map((item) => visit(currentShape.items, item)));
        }
        if (currentShape._tag === "struct" &&
            typeof current === "object" && current !== null && !Array.isArray(current)) {
            const fields = new Map(currentShape.fields.map((field) => [field.key, field.shape]));
            const out = Object.create(Object.getPrototypeOf(current));
            for (const [key, item] of Object.entries(current)) {
                const fieldShape = fields.get(key);
                out[key] = fieldShape === undefined ? item : await visit(fieldShape, item);
            }
            return out;
        }
        return current;
    };
    return visit(shape, value);
};
const refPathKey = (path) => JSON.stringify(path);
const collectAuthoritativeRefSlots = (shape, value, path = [], slots = []) => {
    switch (shape._tag) {
        case "ref":
            if (typeof value === "number")
                slots.push({ path, eid: value, shape });
            return slots;
        case "array":
            if (Array.isArray(value)) {
                value.forEach((item, index) => collectAuthoritativeRefSlots(shape.items, item, [...path, index], slots));
            }
            return slots;
        case "struct":
            if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                for (const field of shape.fields) {
                    if (Object.hasOwn(value, field.key)) {
                        collectAuthoritativeRefSlots(field.shape, value[field.key], [...path, field.key], slots);
                    }
                }
            }
            return slots;
        case "scalar":
        case "opaque":
            return slots;
    }
};
const replayRefExemptions = (fence, shape, value) => {
    const slots = new Map(collectAuthoritativeRefSlots(shape, value).map((slot) => [refPathKey(slot.path), slot]));
    const exemptions = new Map();
    for (const exemption of fence.consumedRefs) {
        const key = refPathKey(exemption.path);
        const slot = slots.get(key);
        if (slot === undefined || slot.eid !== exemption.eid || exemptions.has(key)) {
            throw new OperationRuntimeFault("admission", new Error("durable replay fence does not match operation input refs"));
        }
        exemptions.set(key, exemption);
    }
    return exemptions;
};
const validateAuthoritativeRefs = async (definition, shape, value, db, selfType, exemptions, path = []) => {
    switch (shape._tag) {
        case "ref": {
            if (typeof value !== "number") {
                throw new InvalidRequest({ message: "operation ref does not resolve" });
            }
            if (!(await db.exists(value))) {
                const exemption = exemptions?.get(refPathKey(path));
                if (exemption !== undefined && exemption.eid === value &&
                    refCompatible(definition, shape.refTarget, exemption.type, selfType))
                    return;
                throw new InvalidRequest({ message: "operation ref does not resolve" });
            }
            const concrete = await typeName(db, value);
            if (concrete === undefined || !refCompatible(definition, shape.refTarget, concrete, selfType)) {
                throw new InvalidRequest({ message: "operation ref has an incompatible entity type" });
            }
            return;
        }
        case "array":
            if (Array.isArray(value)) {
                for (let index = 0; index < value.length; index++) {
                    await validateAuthoritativeRefs(definition, shape.items, value[index], db, selfType, exemptions, [...path, index]);
                }
            }
            return;
        case "struct":
            if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                for (const field of shape.fields) {
                    if (Object.hasOwn(value, field.key)) {
                        await validateAuthoritativeRefs(definition, field.shape, value[field.key], db, selfType, exemptions, [...path, field.key]);
                    }
                }
            }
            return;
        case "scalar":
        case "opaque":
            return;
    }
};
const observationKey = (observation) => {
    switch (observation._tag) {
        case "type":
            return `type:${observation.eid}`;
        case "field":
            return `field:${observation.eid}:${observation.ident}`;
        case "exists":
            return `exists:${observation.eid}`;
    }
};
const observationReadKey = (observation) => {
    switch (observation._tag) {
        case "type":
        case "exists":
            return Object.freeze({ kind: observation._tag, eid: observation.eid });
        case "field":
            return Object.freeze({
                kind: "field",
                eid: observation.eid,
                ident: observation.ident,
            });
    }
};
const readAuthorizationObservation = async (db, key) => {
    switch (key.kind) {
        case "type": {
            const datoms = await db.datomsArray(Index.EAVT, {
                e: key.eid,
                a: RAMOSE_TYPE,
            });
            return { _tag: "type", eid: key.eid, datoms: datoms.map(toWireDatom) };
        }
        case "exists":
            return { _tag: "exists", eid: key.eid, value: await db.exists(key.eid) };
        case "field": {
            const attribute = db.schema.attr(key.ident);
            const datoms = attribute === undefined
                ? []
                : await db.datomsArray(Index.EAVT, { e: key.eid, a: attribute.id });
            return {
                _tag: "field",
                eid: key.eid,
                ident: key.ident,
                attributeId: attribute?.id ?? null,
                datoms: datoms.map(toWireDatom),
            };
        }
    }
};
const hashAuthorizationObservations = async (principal, eid, targetRef, observations) => {
    const material = toJson({
        version: 1,
        resourceEid: eid,
        targetRef,
        principalEid: principal.me?.eid ?? null,
        observations: [...observations]
            .map((observation) => [observationKey(observation), observation])
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, observation]) => ({ key, observation })),
    });
    return sha256Hex(UTF8.encode(`${REPLAY_AUTHORIZATION_DIGEST_DOMAIN}${canonicalizeJson(material)}`));
};
const authorizationReadSetDigest = async (principal, db, eid, targetRef, readSet) => hashAuthorizationObservations(principal, eid, targetRef, await Promise.all(readSet.map((key) => readAuthorizationObservation(db, key))));
const targetAuthorizationState = async (definition, principal, db, eid, targetRef) => {
    const observations = new Map();
    const current = db.withComposition(definition.composition);
    const predicate = compileReadFilter({
        unit: definition.unit,
        principal,
        currentDb: current,
        observe: (observation) => {
            observations.set(observationKey(observation), observation);
        },
    });
    const filtered = current.filter(predicate);
    const visibleEid = typeof targetRef === "number"
        ? targetRef
        : await filtered.entid(targetRef);
    const resourceVisible = await filtered.exists(eid);
    const visible = visibleEid === eid && resourceVisible;
    const observed = Object.freeze([...observations.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, observation]) => observation));
    const digest = await hashAuthorizationObservations(principal, eid, targetRef, observed);
    return Object.freeze({ visible, digest, observations: observed });
};
const captureInvocationReplayFence = async (admission, dbAfter) => {
    const originalDb = admission.context.currentDb;
    const typeCache = new Map();
    const originalType = (eid) => {
        const cached = typeCache.get(eid);
        if (cached !== undefined)
            return cached;
        const pending = typeName(originalDb, eid);
        typeCache.set(eid, pending);
        return pending;
    };
    const consumedRefs = [];
    for (const slot of collectAuthoritativeRefSlots(admission.descriptor.input, admission.decoded)) {
        if (await dbAfter.exists(slot.eid))
            continue;
        const concrete = await originalType(slot.eid);
        if (concrete === undefined) {
            throw new OperationRuntimeFault("admission", new Error("admitted operation ref has no pre-commit type"));
        }
        consumedRefs.push(Object.freeze({
            path: Object.freeze([...slot.path]),
            eid: slot.eid,
            type: concrete,
        }));
    }
    let target;
    if (admission.target !== undefined) {
        const invocationTarget = admission[OPERATION_ADMISSION].invocation.target;
        if (invocationTarget === undefined) {
            throw new OperationRuntimeFault("admission", new Error("admitted targeted operation has no invocation target"));
        }
        const referenceEid = typeof invocationTarget === "number"
            ? invocationTarget
            : await dbAfter.entid(invocationTarget) ?? null;
        if (!(await dbAfter.exists(admission.target.eid))) {
            const before = await targetAuthorizationState(admission.resolved.deployed.definition, admission.context.principal, originalDb, admission.target.eid, invocationTarget);
            if (!before.visible) {
                throw new OperationRuntimeFault("admission", new Error("admitted target has no pre-commit authorization witness"));
            }
            const authorizationReadSet = Object.freeze(before.observations
                .filter((observation) => observation.eid !== admission.target.eid)
                .map(observationReadKey));
            const authorizationDigest = await authorizationReadSetDigest(admission.context.principal, dbAfter, admission.target.eid, invocationTarget, authorizationReadSet);
            target = Object.freeze({
                ...admission.target,
                referenceEid,
                postCommit: Object.freeze({
                    kind: "absent",
                    authorizationDigest,
                    authorizationReadSet,
                }),
            });
        }
        else {
            const authorization = await targetAuthorizationState(admission.resolved.deployed.definition, admission.context.principal, dbAfter, admission.target.eid, invocationTarget);
            target = Object.freeze({
                ...admission.target,
                referenceEid,
                postCommit: authorization.visible
                    ? Object.freeze({ kind: "visible" })
                    : Object.freeze({
                        kind: "hidden",
                        authorizationDigest: authorization.digest,
                    }),
            });
        }
    }
    return Object.freeze({
        version: 1,
        ...(target === undefined ? {} : { target }),
        consumedRefs: Object.freeze(consumedRefs),
    });
};
const resolveReportEntity = async (report, value) => {
    if (typeof value === "number")
        return value;
    if (typeof value === "string")
        return report.tempids[value];
    if (Array.isArray(value) && asLookupRef(value) !== undefined) {
        return resolveReportLookup(report, value);
    }
    return undefined;
};
const validateReferenceWrites = async (definition, refs, report) => {
    for (const ref of refs) {
        const ident = fieldIdent(ref.field);
        const target = await resolveReportEntity(report, ref.target);
        if (target === undefined) {
            throw new InvalidRequest({ message: `operation ref for ${ident} does not resolve` });
        }
        validateOperationFieldValue(definition, ident, target);
        if (!ref.requireTarget)
            continue;
        const source = await resolveReportEntity(report, ref.source);
        if (source === undefined || !(await report.dbAfter.exists(target))) {
            throw new InvalidRequest({ message: `operation ref for ${ident} does not resolve` });
        }
        const sourceType = await typeName(report.dbAfter, source) ??
            await typeName(report.dbBefore, source);
        const targetType = await typeName(report.dbAfter, target);
        if (sourceType === undefined ||
            targetType === undefined ||
            !refCompatible(definition, ref.field.refTarget, targetType, sourceType)) {
            throw new InvalidRequest({ message: `operation ref for ${ident} has an incompatible entity type` });
        }
    }
};
const validateDeferredFieldWrites = async (definition, descriptor, writes, report) => {
    for (const write of writes) {
        const ident = fieldIdent(write.field);
        const source = await resolveReportEntity(report, write.source);
        if (source === undefined) {
            throw new InvalidRequest({ message: `operation field ${ident} has an unresolved entity` });
        }
        const concrete = await typeName(report.dbAfter, source) ??
            await typeName(report.dbBefore, source);
        if (concrete === undefined) {
            throw new InvalidRequest({ message: `operation field ${ident} has no canonical entity type` });
        }
        let runtime;
        try {
            runtime = definition.requireFieldRuntime(concrete, ident);
        }
        catch {
            throw new InvalidRequest({
                message: `operation field ${ident} is incompatible with entity type ${concrete}`,
            });
        }
        if (runtime.fixed._tag === "fixed") {
            throw rejected(descriptor, "operation cannot mutate an engine-owned fixed field");
        }
    }
};
const validateSubjectChecks = async (definition, descriptor, checks, report) => {
    for (const check of checks) {
        const source = await resolveReportEntity(report, check.source);
        const concrete = source === undefined
            ? undefined
            : await typeName(report.dbAfter, source) ??
                await typeName(report.dbBefore, source);
        if (concrete === undefined ||
            !typeCompatible(definition, check.owner, concrete)) {
            throw new InvalidRequest({
                message: `operation subject is incompatible with ${operationLabel(descriptor)}`,
            });
        }
    }
};
const admitOperationGrantOnDb = async (runtime, invocation, currentDb, resolvedCatalog) => {
    const authorizationCaller = invocation.caller;
    const expiresAtSeconds = authorizationCaller.exp;
    const resolved = resolvedCatalog ?? await Effect.runPromise(resolveOperationCatalog(runtime, invocation));
    const deployed = resolved.deployed;
    if (Result.isFailure(requireCatalogKey(invocation.catalogKey, deployed.definition.catalogKey)))
        throw deny();
    if (Result.isFailure(requireUnitHash(invocation.unitHash, deployed.definition.unitHash, deployed.definition.catalogKey)))
        throw deny();
    const binding = bindingFor(deployed.definition, invocation.owner, invocation.localName);
    if (binding === undefined)
        throw deny();
    const descriptor = binding.descriptor;
    const authoritativeNowMs = requireFreshAuthorization(runtime, expiresAtSeconds, descriptor);
    const context = await Effect.runPromise(resolved.route === undefined || runtime.bindings === undefined
        ? constructAuthorizedRequestContext({
            authenticate: Effect.succeed(authorizationCaller),
            catalogs: runtime.catalogs.catalogs,
            routeDatabase: invocation.database,
            catalogKey: invocation.catalogKey,
            unitHash: invocation.unitHash,
            currentDb: () => Effect.succeed(currentDb),
        }, authorizationCaller)
        : constructAuthorizedResolvedRequestContext({
            authenticate: Effect.succeed(authorizationCaller),
            bindings: runtime.bindings,
            route: resolved.route,
            currentDb: () => Effect.succeed(currentDb),
        }, authorizationCaller));
    if (!operationGrantAllows(deployed.definition.unit, descriptor, authorizationCaller, context.principal.subject))
        throw deny();
    return Object.freeze({
        resolved,
        deployed,
        binding,
        descriptor,
        context,
        expiresAtSeconds,
        authoritativeNowMs,
    });
};
const authorizeCatalogOperationOnDb = async (connection, runtime, invocation, currentDb, resolvedCatalog, replayFence) => {
    const { authoritativeNowMs, binding, context, deployed, descriptor, expiresAtSeconds, resolved, } = await admitOperationGrantOnDb(runtime, invocation, currentDb, resolvedCatalog);
    for (const allocation of invocation.allocations ?? []) {
        if (!(descriptor.allocations ?? []).some((declared) => declared.slot === allocation.slot)) {
            throw new InvalidRequest({
                message: "operation does not declare this allocation slot",
            });
        }
    }
    let target;
    if (descriptor.id.target === "required") {
        if (invocation.target === undefined)
            throw deny();
        if (replayFence !== undefined) {
            const fenced = replayFence.target;
            if (fenced === undefined) {
                throw new OperationRuntimeFault("admission", new Error("durable replay target fence does not match operation"));
            }
            const currentReferenceEid = typeof invocation.target === "number"
                ? invocation.target
                : await context.currentDb.entid(invocation.target) ?? null;
            if ((typeof invocation.target === "number" &&
                invocation.target !== fenced.eid) ||
                (typeof invocation.target !== "number" &&
                    currentReferenceEid !== fenced.referenceEid) ||
                !typeCompatible(deployed.definition, descriptor.id.owner, fenced.type))
                throw deny();
            const fencedExists = await context.currentDb.exists(fenced.eid);
            switch (fenced.postCommit.kind) {
                case "visible": {
                    target = await resolveVisibleTarget(context, invocation.target);
                    if (!fencedExists ||
                        target === undefined ||
                        target.eid !== fenced.eid)
                        throw deny();
                    break;
                }
                case "absent":
                    if (fencedExists)
                        throw deny();
                    {
                        const currentDigest = await authorizationReadSetDigest(context.principal, context.currentDb, fenced.eid, invocation.target, fenced.postCommit.authorizationReadSet);
                        if (currentDigest !== fenced.postCommit.authorizationDigest) {
                            throw deny();
                        }
                    }
                    target = { eid: fenced.eid, type: fenced.type };
                    break;
                case "hidden": {
                    if (!fencedExists)
                        throw deny();
                    const authorization = await targetAuthorizationState(deployed.definition, context.principal, context.currentDb, fenced.eid, invocation.target);
                    if (authorization.visible ||
                        authorization.digest !== fenced.postCommit.authorizationDigest)
                        throw deny();
                    target = { eid: fenced.eid, type: fenced.type };
                    break;
                }
            }
        }
        else {
            target = await resolveVisibleTarget(context, invocation.target);
            if (target === undefined)
                throw deny();
        }
        if (target === undefined || !typeCompatible(deployed.definition, descriptor.id.owner, target.type)) {
            throw deny();
        }
    }
    else if (invocation.target !== undefined) {
        throw deny();
    }
    else if (replayFence?.target !== undefined) {
        throw new OperationRuntimeFault("admission", new Error("durable replay target fence does not match operation"));
    }
    let decoded;
    try {
        decoded = binding.input.decode(invocation.input);
    }
    catch (cause) {
        if (cause instanceof Schema.SchemaError) {
            throw new InvalidRequest({
                message: `invalid operation input: ${cause.message}`,
            });
        }
        throw new OperationRuntimeFault("input", cause);
    }
    const exemptions = replayFence === undefined
        ? undefined
        : replayRefExemptions(replayFence, descriptor.input, decoded);
    await validateAuthoritativeRefs(deployed.definition, descriptor.input, decoded, context.currentDb, target?.type ?? (descriptor.id.owner.kind === "entity" ? descriptor.id.owner.name : undefined), exemptions);
    return Object.freeze({
        [OPERATION_ADMISSION]: { connection, runtime, invocation },
        resolved,
        binding,
        descriptor,
        context,
        decoded,
        expiresAtSeconds,
        authoritativeNowMs,
        ...(target === undefined ? {} : { target }),
    });
};
export const authorizeCatalogOperationGrant = async (connection, runtime, invocation, resolvedCatalog) => {
    await admitOperationGrantOnDb(runtime, invocation, connection.db(), resolvedCatalog);
};
export const authorizeCatalogOperation = async (connection, runtime, invocation, resolvedCatalog) => authorizeCatalogOperationOnDb(connection, runtime, invocation, connection.db(), resolvedCatalog);
export const authorizeCatalogOperationReplay = async (connection, runtime, invocation, replayFence, resolvedCatalog) => {
    await authorizeCatalogOperationOnDb(connection, runtime, invocation, connection.db(), resolvedCatalog, replayFence);
};
const requireSealing = (sealing) => {
    if (sealing === undefined) {
        throw new OperationRuntimeFault("allocation", new Error("allocation mappings have no server sealing root"));
    }
    return sealing;
};
const requireEntityIdScope = (invocation) => {
    if (invocation.entityIdScope === undefined) {
        throw new OperationRuntimeFault("allocation", new Error("allocation mappings have no sealing scope"));
    }
    return invocation.entityIdScope;
};
export const executeCatalogOperation = async (connection, runtime, invocation, resolvedCatalog, admitted, sealing) => {
    const admission = admitted ?? await authorizeCatalogOperation(connection, runtime, invocation, resolvedCatalog);
    const owner = admission[OPERATION_ADMISSION];
    if (owner.connection !== connection || owner.runtime !== runtime ||
        owner.invocation !== invocation) {
        throw new OperationRuntimeFault("admission", new Error("operation admission belongs to a different invocation"));
    }
    const { authoritativeNowMs, binding, context, decoded, descriptor, expiresAtSeconds, resolved, target, } = admission;
    const authorizationCaller = invocation.caller;
    const deployed = resolved.deployed;
    const collector = createCollector({
        definition: deployed.definition,
        descriptor,
        context,
        caller: authorizationCaller,
        database: invocation.database,
        environment: runtime.environment,
        authoritativeNow: new Date(authoritativeNowMs),
        binding,
        ...(target === undefined ? {} : { target }),
    });
    let draft;
    try {
        draft = await binding.run(collector.op, decoded);
    }
    catch (cause) {
        if (cause instanceof Unauthorized || cause instanceof InvalidRequest ||
            cause instanceof OperationRejected || cause instanceof OperationRuntimeFault)
            throw cause;
        throw new OperationRuntimeFault("body", cause);
    }
    const staged = await connection.transactValidated(collector.tx, async (report) => {
        await validateDeferredFieldWrites(deployed.definition, descriptor, collector.deferredFields, report);
        await validateSubjectChecks(deployed.definition, descriptor, collector.subjectChecks, report);
        await validateReferenceWrites(deployed.definition, collector.refs, report);
        const resolved = await resolveOutputHandles(descriptor.output, draft, report);
        await validateAuthoritativeRefs(deployed.definition, descriptor.output, resolved, report.dbAfter, target?.type ?? (descriptor.id.owner.kind === "entity" ? descriptor.id.owner.name : undefined));
        let encoded;
        try {
            encoded = binding.output.encode(resolved);
            encoded = materializeOutputTransport(encoded);
        }
        catch (cause) {
            throw new OperationRuntimeFault("output", cause);
        }
        const replayFence = await captureInvocationReplayFence(admission, report.dbAfter);
        const requested = invocation.allocations ?? [];
        const extraction = extractAllocations(descriptor.allocations ?? [], descriptor.output, encoded, requested, allocatedEids(report.tempids));
        if (extraction._tag === "Unallocated") {
            throw rejected(descriptor, "operation did not allocate a declared client-ref slot", "allocation", extraction.slot);
        }
        for (const slot of extraction.slots) {
            if (!(await report.dbAfter.exists(slot.eid))) {
                throw rejected(descriptor, "operation did not allocate a declared client-ref slot", "allocation", slot.slot);
            }
        }
        const allocations = extraction.slots.length === 0
            ? []
            : await sealAllocationMappings(requireSealing(sealing), requireEntityIdScope(invocation), extraction.slots, requested);
        return { output: encoded, replayFence, allocations };
    }, authoritativeNowMs, () => requireFreshAuthorization(runtime, expiresAtSeconds, descriptor));
    return {
        report: staged.report,
        output: staged.value.output,
        replayFence: staged.value.replayFence,
        allocations: staged.value.allocations,
        assertFresh: () => requireFreshAuthorization(runtime, expiresAtSeconds, descriptor),
    };
};
//# sourceMappingURL=operations-runtime.js.map