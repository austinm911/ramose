import { lowerAttr } from "./attrRef.js";
import { lowerElemFilter } from "./query/elemFilter.js";
import { assertAgainDepth, assertAgainInShape, assertNotAgain, inspectPullField, assertDirectField, isAgain, isAllShape, isPullDefault, isPullNested, isPullOptional, nested, optional, pullDefault, } from "./Pull.js";
export const pathOf = (attr) => attr.__path ?? [attr.ident];
export const cardsOf = (attr) => attr.__cards ?? [attr.cardinality ?? "one"];
export const revsOf = (attr) => attr.__revs ?? pathOf(attr).map(() => false);
const isRefNav = (attr) => attr.valueType === "ref";
const nestedCount = (n, what) => {
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
        throw new Error(`ramose/query: nested ${what} takes a non-negative integer, got ${String(n)}`);
    }
    return n;
};
const lowerElemOrder = (key, dir, empty) => {
    const path = pathOf(key);
    if (cardsOf(key).includes("many")) {
        throw new Error(`ramose/query: orderBy(${path.join(" → ")}) crosses a cardinality-many attribute — the sort key would be a set, not a value`);
    }
    const revs = revsOf(key);
    return {
        path: [...path],
        ...(revs.some(Boolean) ? { reverse: [...revs] } : {}),
        dir,
        ...(empty !== undefined ? { empty } : {}),
    };
};
const isOrderSpec = (k) => typeof k === "object" && k !== null && !("ident" in k) && "key" in k;
const lowerNestedOpts = (attr, opts) => {
    for (const key of Object.keys(opts)) {
        if (key !== "where" && key !== "orderBy" && key !== "limit" && key !== "offset") {
            throw new Error(`ramose/query: unknown select option "${key}" — a nested collection takes { where, orderBy, limit, offset }`);
        }
    }
    let where;
    if (opts.where !== undefined) {
        where = lowerElemFilter(opts.where, attr);
    }
    let order;
    if (opts.orderBy !== undefined) {
        if (!isRefNav(attr)) {
            throw new Error(`ramose/query: orderBy on ${pathOf(attr).join(" → ")} — a scalar collection's elements are its values; only a reference collection has attributes to sort by`);
        }
        const keys = Array.isArray(opts.orderBy)
            ? opts.orderBy
            : [opts.orderBy];
        order = keys.map((k) => isOrderSpec(k)
            ? lowerElemOrder(k.key, k.dir ?? "asc", k.empty)
            : lowerElemOrder(k, "asc", undefined));
    }
    const limit = opts.limit !== undefined ? nestedCount(opts.limit, "limit") : undefined;
    const offset = opts.offset !== undefined ? nestedCount(opts.offset, "offset") : undefined;
    return {
        ...(where !== undefined && { where }),
        ...(order !== undefined && { order }),
        ...(limit !== undefined && { limit }),
        ...(offset !== undefined && { offset }),
    };
};
const assertManyForOpts = (attr, spelling) => {
    const cards = cardsOf(attr);
    if (cards[cards.length - 1] !== "many") {
        throw new Error(`ramose/query: ${spelling} on ${pathOf(attr).join(" → ")} — the options record filters and pages the elements of a cardinality-many collection; constrain rows in the query itself`);
    }
};
/**
 * A card-many **scalar** collection with pull-phase constraints — the map
 * form's spelling for a hop that has no shape to `.select` through, because
 * its elements are the values themselves. `where` fragments are handed the
 * value var directly; `orderBy` does not apply.
 *
 * ```ts
 * aTags: Ramose.values(User.tags, { where: [(v) => Q.startsWith(v, "a")] }),
 * ```
 */
export const values = (attr, opts) => {
    if (typeof attr !== "object" || attr === null || typeof attr.ident !== "string") {
        throw new Error("ramose/query: values(...) takes a card-many scalar attribute");
    }
    if (isRefNav(attr)) {
        throw new Error(`ramose/query: values(${pathOf(attr).join(" → ")}) — a reference collection has a shape to select; write .select({ … }, { where, orderBy, limit, offset })`);
    }
    assertManyForOpts(attr, "values(...)");
    return {
        _tag: "collection",
        attr,
        constraints: opts === undefined ? {} : lowerNestedOpts(attr, opts),
    };
};
export const makeSelectNested = (attr, shape, constraints) => {
    if (isAgain(shape)) {
        assertAgainDepth(shape.depth);
        if (!isRefNav(attr)) {
            throw new Error("ramose/query: again is only legal on a reference — write ref.select(Ramose.again(n))");
        }
        const cards = cardsOf(attr);
        if (cards[cards.length - 1] === "many" && constraints?.limit === undefined) {
            throw new Error(`ramose/query: ${pathOf(attr).join(" → ")} is a card-many again edge — pass a width in the select options, .select(Ramose.again(${shape.depth}), { limit: n }); the engine default of 1000 is not a tree budget`);
        }
    }
    const nestedSelect = {
        _tag: "select",
        attr,
        shape,
        ...(constraints !== undefined ? { constraints } : {}),
        get optional() {
            return { _tag: "optional", field: nestedSelect };
        },
    };
    return nestedSelect;
};
export const attachAttrNav = (attr) => {
    const api = {
        select(shape, opts) {
            if (!isRefNav(this)) {
                throw new Error(`ramose/query: ${pathOf(this).join(" → ")}.select(...) — only a reference has a nested shape to select`);
            }
            if (opts !== undefined)
                assertManyForOpts(this, "select options");
            return makeSelectNested(this, shape, opts === undefined ? undefined : lowerNestedOpts(this, opts));
        },
        orDefault(value) {
            return pullDefault(this, value);
        },
    };
    return new Proxy(attr, {
        get(target, prop, receiver) {
            if (prop === "optional")
                return optional(receiver);
            if (typeof prop === "string" && prop in api) {
                const v = api[prop];
                return typeof v === "function" ? v.bind(receiver) : v;
            }
            return Reflect.get(target, prop, receiver);
        },
    });
};
export const isSelectNested = (x) => typeof x === "object" &&
    x !== null &&
    x._tag === "select";
const assertNotAll = (shape, key) => {
    if (!isAllShape(shape))
        return;
    throw new Error(key === undefined
        ? "ramose/query: all(N) is a shape — write `select(Ramose.all(N))` on the query itself, not as the contents of a field map"
        : `ramose/query: select field "${key}": all(N) is a shape, not a field — write \`ref.select(Ramose.all(N))\``);
};
export const shapeToPullMap = (shape) => {
    assertNotAll(shape);
    assertNotAgain(shape);
    const fields = shape;
    assertAgainInShape(fields);
    const out = {};
    for (const [key, field] of Object.entries(fields)) {
        assertNotAll(field, key);
        assertNotAgain(field, key);
        out[key] = shapeFieldToPull(field);
    }
    return out;
};
const shapeFieldToPull = (field) => {
    if (isPullOptional(field)) {
        return optional(shapeFieldToPull(field.field));
    }
    if (isPullDefault(field)) {
        return pullDefault(shapeFieldToPull(field.field), field.value);
    }
    if (isSelectNested(field)) {
        if (isAllShape(field.shape) || isAgain(field.shape))
            return field;
        return nested(field.attr, shapeToPullMap(field.shape), field.constraints);
    }
    if (isPullNested(field)) {
        return field;
    }
    return field;
};
let fresh = 0;
const gensym = (prefix) => `?${prefix}${fresh++}`;
export const resetGensym = () => {
    fresh = 0;
};
const ID = ":db/id";
const hopClauses = (root, path, revs, value) => {
    const clauses = [];
    let e = root;
    for (let i = 0; i < path.length - 1; i++) {
        const next = gensym("j");
        clauses.push(revs[i] ? [next, path[i], e] : [e, path[i], next]);
        e = next;
    }
    const last = path.length - 1;
    return [
        ...clauses,
        revs[last] ? [value, path[last], e] : [e, path[last], value],
    ];
};
export const lowerOrderPath = (root, path, revs) => {
    if (path.length === 1 && path[0] === ID)
        return { var: root, clauses: [] };
    const bound = gensym("o");
    return {
        var: bound,
        clauses: [
            [
                "or-join",
                [root, bound],
                ["and", ...hopClauses(root, path, revs, bound)],
                [
                    "and",
                    ["not", ...hopClauses(root, path, revs, "_")],
                    [["ground", [null]], [bound, "..."]],
                ],
            ],
        ],
    };
};
export const requiredClauses = (e, pattern) => {
    if (Array.isArray(pattern) || isAllShape(pattern) || isAgain(pattern))
        return [];
    const out = [];
    for (const [key, field] of Object.entries(fieldsOf(pattern))) {
        const info = inspectPullField(field);
        assertDirectField(key, info.attr, info.nestedPattern !== undefined);
        if (info.optional || info.many || info.hasDefault)
            continue;
        const ident = lowerAttr(info.attr);
        if (ident === ID)
            continue;
        if (info.nestedPattern === undefined || isAgain(info.nestedPattern)) {
            out.push(info.reverse ? [gensym("r"), ident, e] : [e, ident, "_"]);
            continue;
        }
        const target = gensym("r");
        const sub = requiredClauses(target, info.nestedPattern);
        if (info.reverse) {
            out.push([target, ident, e], ...sub);
            continue;
        }
        out.push([e, ident, sub.length > 0 ? target : "_"], ...sub);
    }
    return out;
};
const fieldsOf = (pattern) => typeof pattern === "object" && pattern !== null && !Array.isArray(pattern)
    ? pattern
    : {};
//# sourceMappingURL=shapes.js.map