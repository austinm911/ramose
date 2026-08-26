/** Literate pull map: keys are result names, values are attr refs / `.optional` / `.select`. */
import { isAttrRef } from "./attrRef.js";
import { isSelfRefSchema, refTargetOf } from "./valueTypes.js";
/** Internal: implements `attr.optional`. The result type is `T | undefined`. */
export const optional = (field) => ({
    _tag: "optional",
    field,
    select: ((pattern) => optional(nested(field, pattern))),
});
/**
 * Internal: implements `attr.orDefault(value)`. The value travels verbatim —
 * `null` is a default like any other, which is why lowering asks *whether*
 * there is one rather than comparing against `undefined`.
 *
 * `undefined` is the one value that cannot be a default: it does not survive
 * the JSON the spec travels as (`{default: undefined}` is dropped) and the
 * peer's own gate is `spec.default !== undefined`, so the field would read as
 * `undefined` while its type promised a value. That is `.optional`, spelled
 * wrong — so it is an error rather than a silent lie.
 */
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
/**
 * Internal: nested pull field. Prefer `attr.select({ … })` on stamped attrs;
 * that returns a select-marker which {@link inspectPullField} understands.
 */
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
/** Named so a runtime assert that somehow sees 17 can say what the cap is. */
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
// ── wire lowering ──────────────────────────────────────────────────────────
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
/** The hop-target namespace of a ref attr (self / reverse / `Ref(() => N)`). */
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
/** The result key that selected `:db/id`, if the shape has one. */
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
/**
 * `again` is a shape, not a field: there is no attribute to hang a recur
 * edge on. `ref.select(again(n))` is the nested form.
 */
export const assertNotAgain = (shape, key) => {
    if (!isAgain(unwrapAgainField(shape)))
        return;
    throw new Error(key === undefined
        ? "ramose/query: again is not a top-level shape — write it on a self-ref: ref.select(Ramose.again(n))"
        : `ramose/query: select field "${key}": again is a shape, not a field — write \`ref.select(Ramose.again(n))\``);
};
/**
 * A field map that contains `ref.select(again(n))` must select `N.id` and
 * the recur edge must land in the same namespace.
 */
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
/**
 * A backlink node (`Todo.owner.reverse`). The marker is a plain property so
 * this module stays free of a shapes.ts import — pull is the lower layer.
 */
const isReverseCarrier = (value) => typeof value === "object" &&
    value !== null &&
    value.__reverse === true;
const isSelectNestedField = (value) => typeof value === "object" &&
    value !== null &&
    value._tag === "select" &&
    "attr" in value &&
    "shape" in value;
/**
 * The hop chain a nav carries: `Todo.owner.name` is `[":todo/owner",
 * ":user/name"]`, a bare `User.name` is one ident (or none, for an ident
 * string). Structural, like {@link isReverseCarrier} — pull stays free of
 * shapes.ts.
 */
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
/** `:todo/owner` → `Todo.owner` — the attr spelled the way the caller wrote it. */
const spellAttr = (ident) => {
    const m = /^:([^/]+)\/(.+)$/.exec(ident);
    if (m === null)
        return ident;
    const ns = m[1];
    return `${ns.charAt(0).toUpperCase()}${ns.slice(1)}.${m[2]}`;
};
const attrNameOf = (ident) => /^:[^/]+\/(.+)$/.exec(ident)?.[1] ?? ident;
/** The whole path as one expression: `Todo.owner.reverse.title`. */
const spellPath = (path, revs) => path
    .map((ident, i) => `${i === 0 ? spellAttr(ident) : attrNameOf(ident)}${revs[i] ? ".reverse" : ""}`)
    .join(".");
/** The same path as the nested select that does mean it. */
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
/**
 * A select field names one attribute of the entity being pulled, so a nav
 * that walked a ref first (`Todo.owner.name`) cannot be one: the pull would
 * ask the *todo* for `:user/name` and the row would carry a value it never
 * had — or be dropped for a datom it was never meant to have. The nested
 * select is the shape that means what the path reads like, so say so instead
 * of quietly attaching the leaf ident to the parent.
 */
export const assertDirectField = (as, attr, 
/** The field carries a shape of its own, so the suggestion keeps one. */
leafSelects = false) => {
    const { path, revs } = hopsOf(attr);
    if (path.length < 2)
        return;
    throw new Error(`ramose/query: select field "${as}": ${spellPath(path, revs)} is a multi-hop path (${path.join(" → ")}) — a select field must be a direct field of the queried entity. Use a nested select: ${spellNested(path, revs, leafSelects)}`);
};
/**
 * A constrained scalar collection (`values(User.tags, { where: [ … ] })`).
 * Structural, like {@link isReverseCarrier} — pull stays free of shapes.ts.
 */
const isCollectionCarrier = (value) => typeof value === "object" &&
    value !== null &&
    value._tag === "collection";
/**
 * An element cursor (`User.tags.each`). It names one value of a collection
 * inside that collection's own constraints; as a *field* it would pull the
 * whole attribute under a name that promises one value.
 */
const isElementCarrier = (value) => typeof value === "object" &&
    value !== null &&
    typeof value.__each === "string";
/** Inspect a literate pull field: optional / default / many / nested pattern. */
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
        // a scalar collection *is* the field: its elements are values, and a
        // value has no shape to ask for. A ref one still needs its `.select`.
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
/** The `PullAttrSpec` fields a nested collection's constraints occupy. */
const constraintFields = (c) => c === undefined
    ? {}
    : {
        ...(c.where !== undefined && c.where.length > 0 ? { where: [...c.where] } : {}),
        ...(c.order !== undefined && c.order.length > 0 ? { order: [...c.order] } : {}),
        ...(c.offset !== undefined ? { offset: c.offset } : {}),
        ...(c.limit !== undefined ? { limit: c.limit } : {}),
    };
/** `.orDefault(v)` is the pull-phase `:default` — the peer's substitution. */
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
            // AllShape, an ident array, or a literate map — the same three
            // `lowerPullPattern` already answers at the top of a pull
            sub: lowerPullPattern(info.nestedPattern),
        };
    }
    if (info.reverse) {
        // the peer answers a bare backlink with `{":db/id": n}` — one of them for
        // a component ref, an array of them otherwise — which is neither a scalar
        // nor the selected shape, so ask for the shape you want
        throw new Error(`ramose/schema: ${identOf(info.attr)} backlinks need a shape — write \`.reverse.select({ … })\` for the key \`${as}\``);
    }
    // a card-many scalar carries its own `where` / `order` / `offset` / `limit`
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
/**
 * Lower a literate pull map (or ident-keyed array escape) to a peer pull
 * pattern. Literate maps become AST specs with `:as` / nested `sub`.
 *
 * `all(N)` is the peer's own wildcard, so it lowers to exactly that — the
 * client never expands it into a map of the namespace's attributes.
 */
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
/**
 * Enforce required vs optional so the TypeScript type matches the value.
 *
 * A bare attr is required: missing / null / undefined drops the entity
 * (`null` at the top level). `.optional` may be missing (`undefined`), and
 * `.orDefault(v)` reads as `v` (the peer already substituted it; this is the
 * same answer for a result that arrived without one).
 * Required `.select` drops the parent when the ref is missing or the nested
 * object fails *its* required fields. Cardinality-many `.select` filters the
 * array (empty `[]` is still a valid many). Ident-keyed arrays and the
 * wildcard are left as the peer returned them (all optional in the type).
 */
export const reshapePullResult = (pattern, result) => {
    if (result === null || result === undefined)
        return null;
    if (isAllShape(pattern) || Array.isArray(pattern))
        return result;
    const filtered = filterPull(pattern, result);
    return filtered === undefined ? null : filtered;
};
const isPresent = (value) => value !== undefined && value !== null;
/**
 * The engine's cycle / budget stub: a one-key `{":db/id": n}` map. Nav
 * remaps it to the shape's id alias so the stub survives required-field
 * filtering and the row key is the one the author wrote.
 */
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
/**
 * `undefined` means this entity failed a required field and should be dropped.
 *
 * For a query, `requiredClauses` lowers every top-level required field into a
 * `where` clause, so the drop is the peer's and the top-level `undefined` is
 * unreachable; what stays here is per-element work that cannot change the row
 * count — filtering a cardinality-many array, and `db.pull` of one subject.
 */
const filterPull = (pattern, result) => {
    if (!isPresent(result))
        return undefined;
    // a wildcard row has no required field to fail: every key is optional
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
        // `again` re-applies this enclosing shape — the engine's parent pattern
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
                // a tree can end before the hop bound; missing card-one again
                // must not delete the parent the way a required nested select would
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
            // the peer already substituted the default; this is the same answer for
            // a result that reached here without one (`db.pull` of a stale cache,
            // an ident-keyed reply reshaped by hand)
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