import * as Schema from "effect/Schema";
import { bindingOf, cloneBindingValue, resolveTraitBinding, traitDefinitionOf, } from "./Binding.js";
import { creationDefaultIdentityOf, isOptionalField, } from "./Field.js";
import { bindDeployedSchema } from "./deployedSchema.js";
import { traitsOf } from "./compose.js";
export class BindingConflictError extends Error {
    name = "BindingConflictError";
}
export class CreationValueError extends Error {
    name = "CreationValueError";
}
const formatPath = (path) => path.join(" → ");
const declaredDefault = (get, id, artifactHash, path) => {
    const identity = creationDefaultIdentityOf(get);
    const revision = identity === undefined
        ? Object.freeze({ _tag: "artifact" })
        : Object.freeze({
            _tag: "declared-inputs",
            inputs: identity.inputs,
        });
    const descriptor = Object.freeze({
        id,
        artifactHash,
        revision,
        path: Object.freeze([...path]),
    });
    return Object.freeze({
        descriptor,
        binding: Object.freeze({ ...descriptor, evaluate: get }),
    });
};
const defaultId = (entity, field, kind, ordinal) => JSON.stringify([entity, field, kind, ordinal]);
const sameValue = (left, right, seen = new WeakMap()) => {
    if (Object.is(left, right))
        return true;
    if (left instanceof Date && right instanceof Date) {
        return left.getTime() === right.getTime();
    }
    if (left instanceof Uint8Array && right instanceof Uint8Array) {
        if (left.length !== right.length)
            return false;
        return left.every((value, index) => value === right[index]);
    }
    if (Array.isArray(left) && Array.isArray(right)) {
        const matches = seen.get(left);
        if (matches?.has(right) === true)
            return true;
        if (matches === undefined)
            seen.set(left, new WeakSet([right]));
        else
            matches.add(right);
        return left.length === right.length && left.every((value, index) => sameValue(value, right[index], seen));
    }
    if (typeof left === "object" &&
        left !== null &&
        typeof right === "object" &&
        right !== null) {
        const matches = seen.get(left);
        if (matches?.has(right) === true)
            return true;
        if (matches === undefined)
            seen.set(left, new WeakSet([right]));
        else
            matches.add(right);
        const leftKeys = Object.keys(left).sort();
        const rightKeys = Object.keys(right).sort();
        return leftKeys.length === rightKeys.length &&
            leftKeys.every((key, index) => key === rightKeys[index] &&
                sameValue(left[key], right[key], seen));
    }
    return false;
};
export const bindingUsesOf = (composer) => {
    const out = [];
    const stack = [];
    const visit = (input, path) => {
        const stable = traitDefinitionOf(input);
        if (stack.includes(stable)) {
            throw new BindingConflictError(`ramose/binding: trait cycle while resolving ${formatPath([...path, `trait:${stable.ns}`])}`);
        }
        const nextPath = [...path, `trait:${stable.ns}`];
        const runtime = bindingOf(input);
        if (runtime !== undefined) {
            const binding = resolveTraitBinding(runtime);
            out.push({
                binding,
                path: Object.freeze([...nextPath, `binding:${binding.definition.key}`]),
            });
        }
        stack.push(stable);
        for (const nested of traitsOf(stable))
            visit(nested, nextPath);
        stack.pop();
    };
    for (const trait of traitsOf(composer)) {
        visit(trait, [`entity:${composer.ns}`]);
    }
    return Object.freeze(out);
};
/**
 * Resolve fixed/default metadata and reject conflicting reachable bindings.
 * Maps are keyed by stable field ident, not binding-wrapper identity.
 */
export const compositionValueMetadata = (entity) => compositionValueMetadataFromBindings(entity, bindingUsesOf(entity));
export const compositionValueMetadataFromBindings = (entity, bindings) => {
    const fixed = new Map();
    const defaults = new Map();
    const encoders = new Map();
    for (const field of Object.values(entity.fields)) {
        const binding = bindDeployedSchema(field.schema);
        encoders.set(field.ident, Object.freeze({
            encode: binding.codec.encode,
            projection: binding.projection,
        }));
    }
    for (const use of bindings) {
        for (const [key, value] of Object.entries(use.binding.values)) {
            const field = use.binding.trait.fields[key];
            if (field === undefined)
                continue;
            const path = [...use.path, field.ident];
            if (value === undefined) {
                throw new BindingConflictError(`ramose/binding: fixed value ${field.ident} is undefined (path: ${formatPath(path)})`);
            }
            const validated = decodeField(field, value, "fixed value", encoders.get(field.ident)?.encode);
            if (defaults.has(field.ident)) {
                const prior = defaults.get(field.ident)[0];
                throw new BindingConflictError(`ramose/binding: ${field.ident} is fixed at ${formatPath(path)} but defaulted at ${formatPath(prior.path)}`);
            }
            const prior = fixed.get(field.ident);
            if (prior !== undefined && !sameValue(prior.value, validated)) {
                throw new BindingConflictError(`ramose/binding: conflicting fixed value for ${field.ident} (paths: ${formatPath(prior.path)}; ${formatPath(path)})`);
            }
            if (prior === undefined) {
                fixed.set(field.ident, {
                    key,
                    ident: field.ident,
                    value: cloneBindingValue(validated),
                    path,
                });
            }
        }
        for (const [key, get] of Object.entries(use.binding.defaults)) {
            const field = use.binding.trait.fields[key];
            if (field === undefined)
                continue;
            const path = [...use.path, field.ident];
            const priorFixed = fixed.get(field.ident);
            if (priorFixed !== undefined) {
                throw new BindingConflictError(`ramose/binding: ${field.ident} is defaulted at ${formatPath(path)} but fixed at ${formatPath(priorFixed.path)}`);
            }
            const entries = defaults.get(field.ident) ?? [];
            entries.push({ key, ident: field.ident, get, path });
            defaults.set(field.ident, entries);
        }
    }
    return Object.freeze({ bindings, fixed, defaults, encoders });
};
export const compileCreationPlan = (entity, metadata, artifactHash) => {
    const deployedDefaults = [];
    const fields = Object.entries(entity.fields).map(([key, field]) => {
        const codec = metadata.encoders.get(field.ident);
        if (codec === undefined) {
            throw new CreationValueError(`ramose/create: no deployed codec binding for ${field.ident}`);
        }
        const fixed = metadata.fixed.get(field.ident);
        const defaults = (metadata.defaults.get(field.ident) ?? []).map((entry, index) => {
            const compiled = declaredDefault(entry.get, defaultId(entity.ns, field.ident, "composition", index), artifactHash, entry.path);
            deployedDefaults.push(compiled.binding);
            return compiled.descriptor;
        });
        const fieldDefault = typeof field.default === "function"
            ? (() => {
                const compiled = declaredDefault(field.default, defaultId(entity.ns, field.ident, "field", 0), artifactHash, Object.freeze([`entity:${entity.ns}`, field.ident]));
                deployedDefaults.push(compiled.binding);
                return compiled.descriptor;
            })()
            : undefined;
        return Object.freeze({
            key,
            ident: field.ident,
            cardinality: field.cardinality,
            optional: isOptionalField(field),
            encoder: codec.encode,
            schemaProjection: codec.projection,
            fixed: fixed === undefined ? undefined : cloneBindingValue(fixed.value),
            defaults: Object.freeze(defaults),
            fieldDefault,
        });
    });
    const bindings = metadata.bindings.map((use) => Object.freeze({
        trait: use.binding.trait.ns,
        definition: use.binding.definition.key,
        dependencies: Object.freeze(use.binding.dependencies.map((dependency) => dependency.key).sort()),
    }));
    return Object.freeze({
        plan: Object.freeze({
            entity: entity.ns,
            fields: Object.freeze(fields),
            bindings: Object.freeze(bindings),
        }),
        defaults: Object.freeze(deployedDefaults),
    });
};
const sameDefaultDescriptor = (left, right) => left.id === right.id &&
    left.artifactHash === right.artifactHash &&
    sameValue(left.revision, right.revision) &&
    sameValue(left.path, right.path);
export const pairDeployedCreationDefaults = (plans, bindings) => {
    const byId = new Map();
    for (const binding of bindings) {
        if (byId.has(binding.id)) {
            throw new BindingConflictError(`ramose/default: duplicate deployed binding for ${binding.id}`);
        }
        byId.set(binding.id, binding);
    }
    const descriptorIds = new Set();
    const paired = new Map();
    for (const plan of plans) {
        for (const field of plan.fields) {
            const descriptors = [
                ...field.defaults,
                ...(field.fieldDefault === undefined ? [] : [field.fieldDefault]),
            ];
            for (const descriptor of descriptors) {
                if (descriptorIds.has(descriptor.id)) {
                    throw new BindingConflictError(`ramose/default: duplicate descriptor for ${descriptor.id}`);
                }
                descriptorIds.add(descriptor.id);
                const binding = byId.get(descriptor.id);
                if (binding === undefined) {
                    throw new BindingConflictError(`ramose/default: missing deployed binding for ${descriptor.id}`);
                }
                if (!sameDefaultDescriptor(descriptor, binding)) {
                    throw new BindingConflictError(`ramose/default: mismatched deployed binding for ${descriptor.id}`);
                }
                byId.delete(descriptor.id);
                paired.set(descriptor.id, binding.evaluate);
            }
        }
    }
    const extra = byId.values().next().value;
    if (extra !== undefined) {
        throw new BindingConflictError(`ramose/default: deployed binding has no descriptor for ${extra.id}`);
    }
    return Object.freeze({
        require: (descriptor) => {
            const evaluate = paired.get(descriptor.id);
            if (evaluate === undefined) {
                throw new BindingConflictError(`ramose/default: missing paired callback for ${descriptor.id}`);
            }
            return evaluate;
        },
    });
};
const decodeCompiledField = (field, value, source) => {
    try {
        const normalized = cloneBindingValue(value);
        if (field.cardinality === "many") {
            if (!Array.isArray(normalized)) {
                throw new Error("expected an array for a cardinality-many field");
            }
            for (const item of normalized)
                field.encoder(item);
            return normalized;
        }
        field.encoder(normalized);
        return normalized;
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new CreationValueError(`ramose/create: invalid ${source} for ${field.ident}: ${detail}`);
    }
};
const snapshotDeferredReference = (field, value) => {
    try {
        if (field.cardinality === "many" && !Array.isArray(value)) {
            throw new Error("expected an array for a cardinality-many field");
        }
        return cloneBindingValue(value);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new CreationValueError(`ramose/create: invalid explicit value for ${field.ident}: ${detail}`);
    }
};
export const resolveCompiledCreationValues = (plan, input, context, deployedDefaults, options = {}) => {
    if (!(context.now instanceof Date) || !Number.isFinite(context.now.getTime())) {
        throw new CreationValueError("ramose/create: authoritative now must be a valid Date");
    }
    const authoritativeNow = context.now.getTime();
    const defaultContext = () => Object.freeze({ now: new Date(authoritativeNow) });
    const byKey = new Map(plan.fields.map((field) => [field.key, field]));
    for (const key of Object.keys(input)) {
        const field = byKey.get(key);
        if (field === undefined) {
            throw new CreationValueError(`ramose/create: unknown field ${JSON.stringify(key)} on entity ${JSON.stringify(plan.entity)}`);
        }
        if (field.fixed !== undefined) {
            throw new CreationValueError(`ramose/create: ${field.ident} is engine-owned and cannot be supplied`);
        }
    }
    const out = Object.create(null);
    for (const field of plan.fields) {
        if (field.fixed !== undefined) {
            out[field.key] = decodeCompiledField(field, field.fixed, "fixed value");
            continue;
        }
        const explicit = Object.hasOwn(input, field.key) ? input[field.key] : undefined;
        if (explicit !== undefined) {
            out[field.key] = options.deferredReferenceKeys?.has(field.key) === true
                ? snapshotDeferredReference(field, explicit)
                : decodeCompiledField(field, explicit, "explicit value");
            continue;
        }
        let defaultValue = undefined;
        let defaultPath;
        for (const entry of field.defaults) {
            const value = deployedDefaults.require(entry)(defaultContext());
            if (value === undefined)
                continue;
            const normalized = cloneBindingValue(value);
            if (defaultPath !== undefined && !sameValue(defaultValue, normalized)) {
                throw new BindingConflictError(`ramose/binding: conflicting defaults for ${field.ident} (paths: ${formatPath(defaultPath)}; ${formatPath(entry.path)})`);
            }
            defaultValue = normalized;
            defaultPath = entry.path;
        }
        if (defaultPath !== undefined) {
            out[field.key] = decodeCompiledField(field, defaultValue, "composition default");
            continue;
        }
        if (field.fieldDefault !== undefined) {
            const value = deployedDefaults.require(field.fieldDefault)(defaultContext());
            if (value !== undefined) {
                out[field.key] = decodeCompiledField(field, value, "field default");
                continue;
            }
        }
        if (field.optional)
            continue;
        throw new CreationValueError(`ramose/create: entity ${plan.entity} is missing required field ${field.ident}`);
    }
    return Object.freeze(out);
};
function decodeField(field, value, source, encoder = Schema.encodeUnknownSync(field.schema)) {
    try {
        if (field.cardinality === "many") {
            if (!Array.isArray(value)) {
                throw new Error("expected an array for a cardinality-many field");
            }
            return value.map((item) => {
                encoder(item);
                return item;
            });
        }
        encoder(value);
        return value;
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new CreationValueError(`ramose/create: invalid ${source} for ${field.ident}: ${detail}`);
    }
}
const fixedLocalKeys = (entity, metadata) => {
    const keys = new Set();
    for (const [key, field] of Object.entries(entity.fields)) {
        if (metadata.fixed.has(field.ident))
            keys.add(key);
    }
    return keys;
};
/** Reject any caller-owned occurrence of a fixed key, including `undefined`. */
export const assertNoFixedValues = (entity, input) => {
    const metadata = compositionValueMetadata(entity);
    for (const key of fixedLocalKeys(entity, metadata)) {
        if (Object.hasOwn(input, key)) {
            throw new CreationValueError(`ramose/create: ${entity.fields[key].ident} is engine-owned and cannot be supplied`);
        }
    }
};
/**
 * Resolve one creation row with exact precedence:
 * explicit (except `undefined`) → composition default → field default →
 * optional/many omission → required failure. Fixed values are engine-owned.
 */
export const resolveCreationValues = (entity, input, context, metadata = compositionValueMetadata(entity)) => {
    if (!(context.now instanceof Date) || !Number.isFinite(context.now.getTime())) {
        throw new CreationValueError("ramose/create: authoritative now must be a valid Date");
    }
    const authoritativeNow = context.now.getTime();
    const defaultContext = () => Object.freeze({ now: new Date(authoritativeNow) });
    const fixedKeys = fixedLocalKeys(entity, metadata);
    for (const key of Object.keys(input)) {
        const field = entity.fields[key];
        if (field === undefined) {
            throw new CreationValueError(`ramose/create: unknown field ${JSON.stringify(key)} on entity ${JSON.stringify(entity.ns)}`);
        }
        if (fixedKeys.has(key)) {
            throw new CreationValueError(`ramose/create: ${field.ident} is engine-owned and cannot be supplied`);
        }
    }
    const out = {};
    for (const [key, field] of Object.entries(entity.fields)) {
        const encoder = metadata.encoders.get(field.ident)?.encode;
        if (encoder === undefined) {
            throw new CreationValueError(`ramose/create: no deployed codec binding for ${field.ident}`);
        }
        const fixed = metadata.fixed.get(field.ident);
        if (fixed !== undefined) {
            out[key] = decodeField(field, cloneBindingValue(fixed.value), "fixed value", encoder);
            continue;
        }
        const explicit = Object.hasOwn(input, key) ? input[key] : undefined;
        if (explicit !== undefined) {
            out[key] = decodeField(field, explicit, "explicit value", encoder);
            continue;
        }
        const boundDefaults = metadata.defaults.get(field.ident) ?? [];
        let defaultValue = undefined;
        let defaultPath;
        for (const entry of boundDefaults) {
            const value = entry.get(defaultContext());
            if (value === undefined)
                continue;
            if (defaultPath !== undefined && !sameValue(defaultValue, value)) {
                throw new BindingConflictError(`ramose/binding: conflicting defaults for ${field.ident} (paths: ${formatPath(defaultPath)}; ${formatPath(entry.path)})`);
            }
            defaultValue = value;
            defaultPath = entry.path;
        }
        if (defaultPath !== undefined) {
            out[key] = decodeField(field, defaultValue, "composition default", encoder);
            continue;
        }
        if (typeof field.default === "function") {
            const value = field.default(defaultContext());
            if (value !== undefined) {
                out[key] = decodeField(field, value, "field default", encoder);
                continue;
            }
        }
        if (isOptionalField(field))
            continue;
        throw new CreationValueError(`ramose/create: entity ${entity.ns} is missing required field ${field.ident}`);
    }
    return Object.freeze(out);
};
//# sourceMappingURL=creation.js.map