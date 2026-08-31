export const TRAIT_BINDING = Symbol.for("ramose.trait.binding");
export const TRAIT_BIND_FACTORY = Symbol.for("ramose.trait.bind-factory");
export const cloneBindingValue = (value, seen = new WeakSet()) => {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new Error("ramose/binding: values must contain only finite numbers");
        }
        return Object.is(value, -0) ? 0 : value;
    }
    if (value instanceof Date) {
        if (!Number.isFinite(value.getTime())) {
            throw new Error("ramose/binding: values must contain only valid dates");
        }
        return new Date(value.getTime());
    }
    if (value instanceof Uint8Array)
        return new Uint8Array(value);
    if (typeof value !== "object" || value === null) {
        throw new Error("ramose/binding: values must contain only supported stored data");
    }
    if (seen.has(value)) {
        throw new Error("ramose/binding: values must not contain cycles");
    }
    seen.add(value);
    if (Array.isArray(value)) {
        const copy = Object.freeze(value.map((item) => cloneBindingValue(item, seen)));
        seen.delete(value);
        return copy;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new Error("ramose/binding: values must contain only supported stored data");
    }
    const copy = Object.create(null);
    for (const key of Object.keys(value).sort()) {
        const item = value[key];
        if (item === undefined) {
            throw new Error("ramose/binding: values must not contain undefined");
        }
        Object.defineProperty(copy, key, {
            value: cloneBindingValue(item, seen),
            enumerable: true,
            configurable: false,
            writable: false,
        });
    }
    seen.delete(value);
    return Object.freeze(copy);
};
export const isCodeDefinition = (value) => typeof value === "object" &&
    value !== null &&
    typeof value.key === "string" &&
    typeof value.schema === "object" &&
    value.schema?._tag ===
        "Schema";
export const resolveCodeDefinition = (ref) => {
    const definition = typeof ref === "function" ? ref() : ref;
    if (!isCodeDefinition(definition) || definition.key.length === 0) {
        throw new Error("ramose/reachability: a binding dependency must be a non-empty permanently keyed code definition");
    }
    return definition;
};
export const bindingOf = (value) => {
    if ((typeof value !== "object" && typeof value !== "function") ||
        value === null)
        return undefined;
    return value[TRAIT_BINDING];
};
const plainRecord = (value, label) => {
    if (value === undefined)
        return {};
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`ramose/binding: ${label} must be an object`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new Error(`ramose/binding: ${label} must be a plain object`);
    }
    return value;
};
export const resolveTraitBinding = (runtime) => {
    const definition = resolveCodeDefinition(runtime.definition);
    const result = runtime.bind(definition);
    if (typeof result !== "object" || result === null || Array.isArray(result)) {
        throw new Error(`ramose/binding: trait ${JSON.stringify(runtime.trait.ns)} bind must return an object`);
    }
    const values = plainRecord(result.values, "values");
    const defaultValues = plainRecord(result.defaults, "defaults");
    const defaults = {};
    for (const [key, value] of Object.entries(defaultValues)) {
        if (typeof value !== "function") {
            throw new Error(`ramose/binding: default ${JSON.stringify(key)} on trait ${JSON.stringify(runtime.trait.ns)} must be a synchronous function`);
        }
        defaults[key] = value;
    }
    const dependencyRefs = result.dependencies ?? [];
    if (!Array.isArray(dependencyRefs)) {
        throw new Error("ramose/binding: dependencies must be an array");
    }
    const dependencies = dependencyRefs.map(resolveCodeDefinition);
    for (const key of [...Object.keys(values), ...Object.keys(defaults)]) {
        if (!Object.hasOwn(runtime.trait.fields, key)) {
            throw new Error(`ramose/binding: trait ${JSON.stringify(runtime.trait.ns)} has no field ${JSON.stringify(key)}`);
        }
    }
    const snapshotValues = Object.create(null);
    for (const [key, value] of Object.entries(values)) {
        snapshotValues[key] = cloneBindingValue(value);
    }
    return Object.freeze({
        trait: runtime.trait,
        definition,
        values: Object.freeze(snapshotValues),
        defaults: Object.freeze(defaults),
        dependencies: Object.freeze(dependencies),
    });
};
export const isBindableTrait = (value) => typeof value === "function" && TRAIT_BIND_FACTORY in value;
export const traitDefinitionOf = (value) => bindingOf(value)?.trait ?? value;
export const makeTraitBinding = (trait, definition, bind) => ({
    ...trait,
    [TRAIT_BINDING]: {
        trait,
        definition,
        bind,
    },
});
export const makeBindableTrait = (trait, bind) => {
    const callable = ((definition) => makeTraitBinding(trait, definition, bind));
    for (const key of Reflect.ownKeys(trait)) {
        Object.defineProperty(callable, key, Object.getOwnPropertyDescriptor(trait, key));
    }
    Object.defineProperty(callable, TRAIT_BIND_FACTORY, { value: bind });
    return callable;
};
//# sourceMappingURL=Binding.js.map