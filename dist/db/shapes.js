/**
 * Attr refs and select shapes — the machinery the query surface's terminals
 * reuse. An attribute reference (`User.name`) carries its ident, schema and
 * cardinality (the types `Q.fact` correlates on); a **shape** is the fields a
 * projection asks for (`select({ … })` / `Q.pull`), with `.optional`,
 * `.orDefault`, nested `ref.select({ … })`, the wildcard (`all(N)`) and
 * recursion (`again(n)`). This module also lowers the row-dropping half of a
 * shape (`requiredClauses`) and binds sort keys without dropping rows
 * (`lowerOrderPath`) — both shared by the kernel query lowering.
 *
 * The navigational query surface that used to live here (predicate methods
 * on attrs, quantifiers, element cursors, `Ramose.query(N)`) is gone: the
 * kernel query language (`Q`, `Query.q`, the pipeable stdlib) is the one
 * constraint language.
 */
import { lowerAttr } from "./attrRef.js";
import { lowerElemFilter } from "./query/elemFilter.js";
import { assertAgainDepth, assertAgainInShape, assertNotAgain, inspectPullField, assertDirectField, isAgain, isAllShape, isPullDefault, isPullNested, isPullOptional, nested, optional, pullDefault, } from "./Pull.js";
export const pathOf = (attr) => attr.__path ?? [attr.ident];
export const cardsOf = (attr) => attr.__cards ?? [attr.cardinality ?? "one"];
/** Reversal flag per hop. A path with no reversed hop reports all `false`. */
export const revsOf = (attr) => attr.__revs ?? pathOf(attr).map(() => false);
/** Does this node end on a ref (a backlink is one, read the other way)? */
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
/** Lower a {@link NestedOpts} record into the wire's nested constraints.
 * Eager and total, like every shape-side lowering. */
const lowerNestedOpts = (attr, opts) => {
    for (const key of Object.keys(opts)) {
        if (key !== "where" && key !== "orderBy" && key !== "limit" && key !== "offset") {
            throw new Error(`ramose/query: unknown select option "${key}" — a nested collection takes { where, orderBy, limit, offset }`);
        }
    }
    const out = {};
    if (opts.where !== undefined) {
        out.where = lowerElemFilter(opts.where, attr);
    }
    if (opts.orderBy !== undefined) {
        if (!isRefNav(attr)) {
            throw new Error(`ramose/query: orderBy on ${pathOf(attr).join(" → ")} — a scalar collection's elements are its values; only a reference collection has attributes to sort by`);
        }
        const keys = Array.isArray(opts.orderBy)
            ? opts.orderBy
            : [opts.orderBy];
        out.order = keys.map((k) => isOrderSpec(k)
            ? lowerElemOrder(k.key, k.dir ?? "asc", k.empty)
            : lowerElemOrder(k, "asc", undefined));
    }
    if (opts.limit !== undefined)
        out.limit = nestedCount(opts.limit, "limit");
    if (opts.offset !== undefined)
        out.offset = nestedCount(opts.offset, "offset");
    return out;
};
/** Select options need a collection: only a card-many hop has elements to
 * filter, order, and page. */
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
/** Stamp an attribute reference with the pull-shaping methods. */
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
        // like `.optional`, it wraps the *receiver* (issue #69)
        orDefault(value) {
            return pullDefault(this, value);
        },
    };
    return new Proxy(attr, {
        get(target, prop, receiver) {
            // `.optional` wraps the *receiver*, so a reversed node keeps its flags
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
/**
 * `all(N)` is a shape, not a field: there is no attribute to hang a
 * wildcard on. `ref.select(all(N))` is the nested form — a SelectNested,
 * not a bare AllShape — and lowers to the peer's `[*]` on that hop.
 */
const assertNotAll = (shape, key) => {
    if (!isAllShape(shape))
        return;
    throw new Error(key === undefined
        ? "ramose/query: all(N) is a shape — write `select(Ramose.all(N))` on the query itself, not as the contents of a field map"
        : `ramose/query: select field "${key}": all(N) is a shape, not a field — write \`ref.select(Ramose.all(N))\``);
};
/** Convert a select shape into the literate pull map `lowerPullPattern` knows. */
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
// ── lowering helpers shared with the kernel query surface ──────────────────
let fresh = 0;
const gensym = (prefix) => `?${prefix}${fresh++}`;
/** @internal The lowering pass resets for deterministic names. */
export const resetGensym = () => {
    fresh = 0;
};
/** The pseudo-attribute: the entity variable itself, never a datom. */
const ID = ":db/id";
/**
 * `[?e :a ?j] [?j :b <value>]` — the join chain a path of idents walks.
 * A reversed hop is the same datom read the other way: `[?j :a ?e]`.
 */
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
/**
 * Bind a sort variable to the value at `path` **without dropping rows**: one
 * or-join branch walks the path, the other proves it is absent and grounds
 * `null`, which the engine places per the key's `empty`. (`get-else` cannot
 * stand in: a function binding of `null` drops the row.)
 */
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
/**
 * The row-dropping half of `filterPull`, as `where` clauses — so the peer's
 * row set is already the one the client keeps and `:limit` pages it honestly.
 *
 * A required cardinality-one field must be present (a nested one recursively,
 * through the ref); `.optional` and cardinality-many fields never drop the
 * row (a missing many is `[]`), and `:db/id` is always there.
 *
 * The card-one backlink of a component ref is required like any other card-one
 * field, and its clause reads the datom backwards — the entity that must exist
 * is the *owner* pointing at this row.
 *
 * A defaulted field is not required either — the whole point of `.orDefault`
 * is that the entity without the datom is a row, reading as the default. A
 * clause here would drop exactly the rows it exists to keep, and `:limit`
 * would page a set the client never sees.
 */
export const requiredClauses = (e, pattern) => {
    // a wildcard has no required field: every key is optional
    if (Array.isArray(pattern) || isAllShape(pattern) || isAgain(pattern))
        return [];
    const out = [];
    for (const [key, field] of Object.entries(fieldsOf(pattern))) {
        const info = inspectPullField(field);
        // a multi-hop field would ask `?e` for the *leaf* ident and drop rows for
        // a datom they were never meant to have — reject it here too, not just in
        // the pull pattern, because this half runs first
        assertDirectField(key, info.attr, info.nestedPattern !== undefined);
        if (info.optional || info.many || info.hasDefault)
            continue;
        const ident = lowerAttr(info.attr);
        if (ident === ID)
            continue;
        // a backlink reads the datom the other way: the required entity is the one
        // *pointing at* `?e` (a component backlink is card-one, so it gets here)
        if (info.nestedPattern === undefined || isAgain(info.nestedPattern)) {
            out.push(info.reverse ? [gensym("r"), ident, e] : [e, ident, "_"]);
            continue;
        }
        const target = gensym("r");
        const sub = requiredClauses(target, info.nestedPattern);
        if (info.reverse) {
            // the entity position of a clause has to be a variable, never `_`
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