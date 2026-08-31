import { isAttrRef } from "./attrRef.js";
import { isSelfRefSchema, refTargetOf } from "./valueTypes.js";
export const optional = (field) => ({
    _tag: "optional",
    field,
    select: ((pattern) => optional(nested(field, pattern))),
});
export const pullDefault = (field, value) => {
    if (value === undefined) {
        throw new Error("ramose/query: .orDefault(undefined) is not a default — the peer would read the field as missing anyway. Use `.optional` for a field that may be absent.");
    }
    return {
        _tag: "default",
        field,
        value,
    };
};
export const nested = (attr, pattern, constraints) => {
    const result = {
        _tag: "nested",
        attr,
        pattern,
        ...(constraints !== undefined ? { constraints } : {}),
        get optional() {
            return optional(result);
        },
    };
    return result;
};
/** Same-namespace shortcut: `pick(User, "name", "age")`. */
export const pick = (ns, ...keys) => {
    const fields = {};
    for (const key of keys)
        fields[key] = ns.fields[key];
    return fields;
};
/**
 * Every attribute of the matched entity: `query(Todo).select(all(Todo))`,
 * `Todo.owner.select(all(User))` under a ref, or `db.pull(eid, all(Todo))`.
 * The same wildcard `db.pull(eid, ["*"])` asks for, with the namespace's
 * idents typed.
 */
export const all = (ns) => ({
    _tag: "all",
    ns,
});
export const isAllShape = (value) => typeof value === "object" &&
    value !== null &&
    value._tag === "all" &&
    "ns" in value;
export const AGAIN_MAX_DEPTH = 16;
export const again = (depth) => {
    if (typeof depth !== "number" || !Number.isInteger(depth) || depth < 1) {
        throw new Error(`ramose/query: Ramose.again(n) takes a positive integer hop bound, got ${String(depth)}`);
    }
    if (depth > AGAIN_MAX_DEPTH) {
        throw new Error(`ramose/query: Ramose.again(${depth}) exceeds the hop bound of ${AGAIN_MAX_DEPTH}`);
    }
    return { _tag: "again", depth: depth };
};
export const isAgain = (value) => typeof value === "object" &&
    value !== null &&
    value._tag === "again" &&
    typeof value.depth === "number";
export const isPullOptional = (value) => typeof value === "object" &&
    value !== null &&
    value._tag === "optional" &&
    "field" in value;
export const isPullDefault = (value) => typeof value === "object" &&
    value !== null &&
    value._tag === "default" &&
    "field" in value &&
    "value" in value;
export const isPullNested = (value) => typeof value === "object" &&
    value !== null &&
    value._tag === "nested" &&
    "attr" in value &&
    "pattern" in value;
const identOf = (field) => {
    if (typeof field === "string")
        return field;
    if (isAttrRef(field))
        return field.ident;
    throw new Error(`ramose/schema: pull field is not an attr ref: ${String(field)}`);
};
const nsOfIdent = (ident) => /^:([^/]+)\//.exec(ident)?.[1];
const unwrapAgainField = (field) => {
    let current = field;
    if (isPullOptional(current))
        current = current.field;
    else if (isPullDefault(current))
        current = current.field;
    return current;
};
export const refTargetNs = (attr) => {
    if (isReverseCarrier(attr))
        return nsOfIdent(identOf(attr));
    const schema = attr?.schema;
    if (isSelfRefSchema(schema))
        return nsOfIdent(identOf(attr));
    const ns = refTargetOf(schema)?.()?.ns;
    return typeof ns === "string" ? ns : undefined;
};
const tryIdentOf = (field) => {
    try {
        return identOf(inspectPullField(field).attr);
    }
    catch {
        return undefined;
    }
};
export const idKeyOf = (pattern) => {
    if (isAgain(pattern) || isAllShape(pattern) || Array.isArray(pattern)) {
        return undefined;
    }
    for (const [key, field] of Object.entries(fieldsOf(pattern))) {
        if (tryIdentOf(field) === ":db/id")
            return key;
    }
    return undefined;
};
const shapeNsOf = (shape) => {
    for (const field of Object.values(shape)) {
        const ident = tryIdentOf(field);
        if (ident !== undefined && ident !== ":db/id") {
            const ns = nsOfIdent(ident);
            if (ns !== undefined)
                return ns;
        }
    }
    return undefined;
};
export const assertAgainDepth = (depth) => {
    if (typeof depth !== "number" || !Number.isInteger(depth) || depth < 1) {
        throw new Error(`ramose/query: Ramose.again(n) takes a positive integer hop bound, got ${String(depth)}`);
    }
    if (depth > AGAIN_MAX_DEPTH) {
        throw new Error(`ramose/query: Ramose.again(${depth}) exceeds the hop bound of ${AGAIN_MAX_DEPTH}`);
    }
    return depth;
};
export const assertNotAgain = (shape, key) => {
    if (!isAgain(unwrapAgainField(shape)))
        return;
    throw new Error(key === undefined
        ? "ramose/query: again is not a top-level shape — write it on a self-ref: ref.select(Ramose.again(n))"
        : `ramose/query: select field "${key}": again is a shape, not a field — write \`ref.select(Ramose.again(n))\``);
};
export const assertAgainInShape = (shape) => {
    let hasAgain = false;
    let hasId = false;
    const enclosingNs = shapeNsOf(shape);
    for (const [key, field] of Object.entries(shape)) {
        assertNotAgain(field, key);
        const ident = tryIdentOf(field);
        if (ident === ":db/id")
            hasId = true;
        const info = inspectPullField(field);
        if (!isAgain(info.nestedPattern))
            continue;
        hasAgain = true;
        const depth = assertAgainDepth(info.nestedPattern.depth);
        const target = refTargetNs(info.attr);
        if (target !== undefined &&
            enclosingNs !== undefined &&
            target !== enclosingNs) {
            throw new Error(`ramose/query: select field "${key}": ${spellAttr(identOf(info.attr))}.select(Ramose.again(${depth})) is a :${target}/… edge — again re-applies this shape, which is a :${enclosingNs}/… row`);
        }
    }
    if (hasAgain && !hasId) {
        throw new Error("ramose/query: a shape that contains again must select N.id — the stub is that branded id cell");
    }
};
const fieldsOf = (pattern) => {
    if (typeof pattern === "object" && pattern !== null && !Array.isArray(pattern)) {
        return pattern;
    }
    return {};
};
const cardinalityOf = (field) => {
    const card = field?.cardinality;
    return card === "many" ? "many" : "one";
};
const isReverseCarrier = (value) => typeof value === "object" &&
    value !== null &&
    value.__reverse === true;
const isSelectNestedField = (value) => typeof value === "object" &&
    value !== null &&
    value._tag === "select" &&
    "attr" in value &&
    "shape" in value;
const hopsOf = (attr) => {
    const carrier = attr;
    const path = Array.isArray(carrier?.__path)
        ? carrier.__path
        : [];
    const revs = Array.isArray(carrier?.__revs)
        ? carrier.__revs
        : path.map(() => false);
    return { path, revs };
};
const spellAttr = (ident) => {
    const m = /^:([^/]+)\/(.+)$/.exec(ident);
    if (m === null)
        return ident;
    const ns = m[1];
    return `${ns.charAt(0).toUpperCase()}${ns.slice(1)}.${m[2]}`;
};
const attrNameOf = (ident) => /^:[^/]+\/(.+)$/.exec(ident)?.[1] ?? ident;
const spellPath = (path, revs) => path
    .map((ident, i) => `${i === 0 ? spellAttr(ident) : attrNameOf(ident)}${revs[i] ? ".reverse" : ""}`)
    .join(".");
const spellNested = (path, revs, leafSelects) => {
    const last = path.length - 1;
    const leaf = path[last];
    let out = `${attrNameOf(leaf)}: ${spellAttr(leaf)}${revs[last] ? ".reverse" : ""}${revs[last] || leafSelects ? ".select({ … })" : ""}`;
    for (let i = last - 1; i >= 0; i--) {
        const hop = path[i];
        out = `${attrNameOf(hop)}: ${spellAttr(hop)}${revs[i] ? ".reverse" : ""}.select({ ${out} })`;
    }
    return `{ ${out} }`;
};
export const assertDirectField = (as, attr, leafSelects = false) => {
    const { path, revs } = hopsOf(attr);
    if (path.length < 2)
        return;
    throw new Error(`ramose/query: select field "${as}": ${spellPath(path, revs)} is a multi-hop path (${path.join(" → ")}) — a select field must be a direct field of the queried entity. Use a nested select: ${spellNested(path, revs, leafSelects)}`);
};
const isCollectionCarrier = (value) => typeof value === "object" &&
    value !== null &&
    value._tag === "collection";
const isElementCarrier = (value) => typeof value === "object" &&
    value !== null &&
    typeof value.__each === "string";
export const inspectPullField = (field) => {
    let optional = false;
    let hasDefault = false;
    let defaultValue;
    let current = field;
    if (isPullOptional(current)) {
        optional = true;
        current = current.field;
    }
    else if (isPullDefault(current)) {
        hasDefault = true;
        defaultValue = current.value;
        current = current.field;
    }
    if (isElementCarrier(current)) {
        throw new Error(`ramose/query: ${identOf(current)}.each is an element cursor, not a select field — it names one value of the collection inside its own every / none / some / where / orderBy. Select the attribute itself.`);
    }
    if (isCollectionCarrier(current)) {
        if (current.attr?.valueType === "ref") {
            throw new Error("ramose/schema: a filtered reference collection needs a shape — write `.select({ … }, { where: [ … ] })`");
        }
        return {
            optional,
            hasDefault,
            defaultValue,
            many: true,
            reverse: false,
            nestedPattern: undefined,
            constraints: current.constraints,
            attr: current.attr,
        };
    }
    if (isPullNested(current)) {
        return {
            optional,
            hasDefault,
            defaultValue,
            many: cardinalityOf(current.attr) === "many",
            reverse: isReverseCarrier(current.attr),
            nestedPattern: current.pattern,
            constraints: current.constraints,
            attr: current.attr,
        };
    }
    if (isSelectNestedField(current)) {
        return {
            optional,
            hasDefault,
            defaultValue,
            many: cardinalityOf(current.attr) === "many",
            reverse: isReverseCarrier(current.attr),
            nestedPattern: current.shape,
            constraints: current.constraints,
            attr: current.attr,
        };
    }
    return {
        optional,
        hasDefault,
        defaultValue,
        many: cardinalityOf(current) === "many",
        reverse: isReverseCarrier(current),
        nestedPattern: undefined,
        constraints: undefined,
        attr: current,
    };
};
const constraintFields = (c) => c === undefined
    ? {}
    : {
        ...(c.where !== undefined && c.where.length > 0 ? { where: [...c.where] } : {}),
        ...(c.order !== undefined && c.order.length > 0 ? { order: [...c.order] } : {}),
        ...(c.offset !== undefined ? { offset: c.offset } : {}),
        ...(c.limit !== undefined ? { limit: c.limit } : {}),
    };
const defaultField = (info) => info.hasDefault ? { default: info.defaultValue } : {};
const lowerField = (as, field) => {
    const info = inspectPullField(field);
    assertDirectField(as, info.attr, info.nestedPattern !== undefined);
    if (isAgain(info.nestedPattern)) {
        const recursion = assertAgainDepth(info.nestedPattern.depth);
        return {
            kind: "attr",
            attr: identOf(info.attr),
            reverse: info.reverse,
            as,
            ...defaultField(info),
            ...constraintFields(info.constraints),
            recursion,
        };
    }
    if (info.nestedPattern !== undefined) {
        return {
            kind: "attr",
            attr: identOf(info.attr),
            reverse: info.reverse,
            as,
            ...defaultField(info),
            ...constraintFields(info.constraints),
            sub: lowerPullPattern(info.nestedPattern),
        };
    }
    if (info.reverse) {
        throw new Error(`ramose/schema: ${identOf(info.attr)} backlinks need a shape — write \`.reverse.select({ … })\` for the key \`${as}\``);
    }
    return {
        kind: "attr",
        attr: identOf(info.attr),
        reverse: false,
        as,
        ...defaultField(info),
        ...constraintFields(info.constraints),
    };
};
const lowerLiterateMap = (pattern) => {
    const fields = fieldsOf(pattern);
    assertAgainInShape(fields);
    return Object.entries(fields).map(([key, field]) => lowerField(key, field));
};
const lowerIdentPull = (pattern) => pattern.map((a) => {
    if (a === "*")
        return "*";
    if (isAttrRef(a))
        return a.ident;
    return a;
});
export const lowerPullPattern = (pattern) => {
    if (isAgain(pattern)) {
        throw new Error("ramose/query: again is not a top-level shape — write it on a self-ref: ref.select(Ramose.again(n))");
    }
    if (isAllShape(pattern))
        return ["*"];
    if (Array.isArray(pattern))
        return lowerIdentPull(pattern);
    return lowerLiterateMap(pattern);
};
export const pullReshapeIdentity = (pattern) => {
    if (isAllShape(pattern))
        return "*";
    if (isAgain(pattern))
        return "again";
    if (Array.isArray(pattern))
        return "idents";
    const fields = fieldsOf(pattern);
    return Object.entries(fields).map(([key, field]) => {
        const info = inspectPullField(field);
        const nested = info.nestedPattern === undefined
            ? null
            : isAgain(info.nestedPattern)
                ? "again"
                : pullReshapeIdentity(info.nestedPattern);
        return [
            key,
            info.optional,
            info.hasDefault,
            info.hasDefault ? [typeof info.defaultValue, info.defaultValue] : null,
            info.many,
            info.reverse,
            nested,
        ];
    });
};
const mapWildcardEntityIds = (value, map) => {
    if (value === null || typeof value !== "object")
        return value;
    if (Array.isArray(value)) {
        return value.map((item) => mapWildcardEntityIds(item, map));
    }
    const row = value;
    let out;
    for (const [key, cell] of Object.entries(row)) {
        const mapped = key === ":db/id" && typeof cell === "number"
            ? map(cell)
            : mapWildcardEntityIds(cell, map);
        if (mapped === cell)
            continue;
        out ??= { ...row };
        out[key] = mapped;
    }
    return out ?? row;
};
export const mapPullEntityIds = (pattern, result, map) => {
    if (result === null || result === undefined)
        return result;
    if (Array.isArray(result)) {
        return result.map((item) => mapPullEntityIds(pattern, item, map));
    }
    if (typeof result !== "object")
        return result;
    if (isAllShape(pattern) || Array.isArray(pattern) || isAgain(pattern)) {
        return mapWildcardEntityIds(result, map);
    }
    const row = result;
    let out;
    const write = (key, value) => {
        out ??= { ...row };
        out[key] = value;
    };
    const idKey = idKeyOf(pattern);
    if (idKey !== undefined && typeof row[idKey] === "number") {
        write(idKey, map(row[idKey]));
    }
    for (const [key, field] of Object.entries(fieldsOf(pattern))) {
        if (key === idKey || !Object.hasOwn(row, key))
            continue;
        const nested = inspectPullField(field).nestedPattern;
        const child = isAgain(nested) ? pattern : nested;
        const mapped = child === undefined
            ? mapWildcardEntityIds(row[key], map)
            : mapPullEntityIds(child, row[key], map);
        if (mapped !== row[key])
            write(key, mapped);
    }
    return out ?? row;
};
export const reshapePullResult = (pattern, result) => {
    if (result === null || result === undefined)
        return null;
    if (isAllShape(pattern) || Array.isArray(pattern))
        return result;
    const filtered = filterPull(pattern, result);
    return filtered === undefined ? null : filtered;
};
const isPresent = (value) => value !== undefined && value !== null;
const isIrStub = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const keys = Object.keys(value);
    return (keys.length === 1 &&
        keys[0] === ":db/id" &&
        typeof value[":db/id"] === "number");
};
const remapStub = (pattern, stub) => {
    const key = idKeyOf(pattern);
    if (key === undefined)
        return undefined;
    return { [key]: stub[":db/id"] };
};
const filterPull = (pattern, result) => {
    if (!isPresent(result))
        return undefined;
    if (isAllShape(pattern) || Array.isArray(pattern) || isAgain(pattern)) {
        return result;
    }
    if (typeof result !== "object")
        return undefined;
    if (isIrStub(result)) {
        return remapStub(pattern, result);
    }
    const fields = fieldsOf(pattern);
    const rec = result;
    const out = {};
    for (const [key, field] of Object.entries(fields)) {
        const info = inspectPullField(field);
        const raw = rec[key];
        const missing = !isPresent(raw);
        const recur = isAgain(info.nestedPattern);
        const childPattern = recur ? pattern : info.nestedPattern;
        if (childPattern !== undefined) {
            if (info.many) {
                if (missing) {
                    out[key] = info.optional ? undefined : [];
                    continue;
                }
                const arr = Array.isArray(raw) ? raw : [raw];
                const kept = [];
                for (const item of arr) {
                    const child = filterPull(childPattern, item);
                    if (child !== undefined)
                        kept.push(child);
                }
                out[key] = kept;
                continue;
            }
            if (missing) {
                if (info.optional || recur) {
                    out[key] = undefined;
                    continue;
                }
                return undefined;
            }
            const child = filterPull(childPattern, raw);
            if (child === undefined) {
                if (info.optional || recur) {
                    out[key] = undefined;
                    continue;
                }
                return undefined;
            }
            out[key] = child;
            continue;
        }
        if (missing) {
            if (info.hasDefault) {
                out[key] = info.defaultValue;
                continue;
            }
            if (info.optional) {
                out[key] = undefined;
                continue;
            }
            if (info.many) {
                out[key] = [];
                continue;
            }
            return undefined;
        }
        out[key] = info.many && !Array.isArray(raw) ? [raw] : raw;
    }
    return out;
};
//# sourceMappingURL=Pull.js.map