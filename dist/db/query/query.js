import { PREDICATES, vkey } from "../../internal/core/query/builtins.js";
import { RAMOSE_TYPE_IDENT, TX_BASE } from "../../internal/core/schema.js";
import { makeEid } from "../Eid.js";
import { InvalidRequest, NotOne } from "../Errors.js";
import { isMutationRef } from "../refs.js";
import { lowerOrderPath, requiredClauses, resetGensym, shapeToPullMap, cardsOf, pathOf, revsOf, } from "../shapes.js";
import { inspectPullField, isAgain, isAllShape, lowerPullPattern, mapPullEntityIds, pullReshapeIdentity, reshapePullResult, } from "../Pull.js";
import { Q, isFocusSentinel, isPullSpec, isRowsSpec, isAggSpec, isValueSpec, isDistinctSpec, isVar, isBlank, collectBody, mkVar, runBody, } from "./kernel.js";
export const isCursor = (x) => typeof x === "object" &&
    x !== null &&
    x._tag === "Cursor" &&
    Array.isArray(x.keys);
export const isPipeline = (x) => typeof x === "object" && x !== null && x._tag === "Pipeline";
const isIdsSpec = (x) => typeof x === "object" && x !== null && x._tag === "idsSpec";
export const isQueryObject = (x) => typeof x === "object" && x !== null && x._tag === "Query";
const groupKeyId = (path, revs) => path.map((ident, i) => `${revs[i] ? "~" : ""}${ident}`).join("\0");
const isGen = (x) => typeof x === "object" && x !== null && typeof x.next === "function";
const runInto = (qv, ctx, stripCursor) => {
    const out = qv.body();
    if (isPipeline(out))
        return assemblePipeline(out, ctx, stripCursor);
    if (isGen(out)) {
        const raw = runBody(out, ctx);
        let distinct = false;
        let proj = raw;
        while (isDistinctSpec(proj)) {
            distinct = true;
            proj = proj.inner;
        }
        return {
            clauses: ctx.clauses,
            proj: normalizeProj(proj),
            focus: focusOf(proj),
            order: [],
            limit: undefined,
            offset: undefined,
            groupKeys: new Map(),
            distinct,
        };
    }
    throw new Error("ramose/query: a Query.q body is a generator of clauses returning the projection, or a function returning a pipeline");
};
const normalizeProj = (proj) => {
    if (isVar(proj))
        return { _tag: "idsSpec", v: proj };
    if (isDistinctSpec(proj)) {
        throw new Error("ramose/query: Q.distinct(...) wraps the whole projection, not one cell");
    }
    if (isPullSpec(proj) || isRowsSpec(proj) || isValueSpec(proj))
        return proj;
    if (typeof proj === "object" && proj !== null && !Array.isArray(proj)) {
        const cells = proj;
        if (Object.keys(cells).length === 0) {
            throw new Error("ramose/query: the body returned an empty projection — name at least one cell");
        }
        return cells;
    }
    throw new Error("ramose/query: the body must return its projection — Q.pull(focus, shape), Q.rows({ … }), Q.value(...), Q.distinct({ … }), a record of bound handles, or a focus var for bare ids");
};
const focusOf = (proj) => {
    if (isVar(proj))
        return proj;
    if (isPullSpec(proj))
        return proj.focus;
    return undefined;
};
const assemblePipeline = (pipe, ctx, stripCursor) => {
    const root = mkVar("entity", pipe.ns.ns);
    ctx.clauses.push({ _tag: "memberOf", ns: pipe.ns, v: root });
    let focus = root;
    let select;
    let extraCells;
    let selectFocus = root;
    let projectIds = false;
    const order = [];
    let limit;
    let offset;
    const groupKeys = new Map();
    for (const st of pipe.stages) {
        switch (st.kind) {
            case "frag": {
                if (select !== undefined) {
                    throw new Error("ramose/query: a filter after select(...) — clauses close before the projection; move the stage before select");
                }
                const r = runBody(st.frag(focus), ctx);
                if (isVar(r))
                    focus = r;
                break;
            }
            case "select":
                select = st.shape;
                selectFocus = focus;
                extraCells =
                    st.extra === undefined
                        ? undefined
                        : rewriteExtra(typeof st.extra === "function" ? st.extra(focus) : st.extra, focus);
                projectIds = false;
                break;
            case "ids":
                projectIds = true;
                break;
            case "orderBy":
                order.push(resolveOrderKey(st, select, extraCells));
                break;
            case "limit":
                limit = st.n;
                break;
            case "offset":
                offset = st.n;
                break;
        }
    }
    if (stripCursor) {
        order.length = 0;
        limit = undefined;
        offset = undefined;
    }
    let proj;
    let shapeCells;
    if (select !== undefined && !projectIds && extraCells !== undefined) {
        shapeCells = expandShapeToCells(selectFocus, select, ctx, groupKeys);
        proj = { ...shapeCells, ...extraCells };
    }
    else if (select !== undefined && !projectIds) {
        proj = { _tag: "pullSpec", focus: selectFocus, shape: select };
    }
    else {
        proj = { _tag: "idsSpec", v: focus };
    }
    return {
        clauses: ctx.clauses,
        proj,
        focus: select !== undefined && !projectIds ? selectFocus : focus,
        order: finalizePendingOrders(order, select, projectIds, shapeCells),
        limit,
        offset,
        groupKeys,
        distinct: false,
    };
};
const finalizePendingOrders = (order, select, projectIds, shapeCells) => {
    const out = [];
    for (const o of order) {
        if (o.kind !== "shapeKey") {
            out.push(o);
            continue;
        }
        if (shapeCells !== undefined) {
            const cell = shapeCells[o.key];
            if (!isVar(cell)) {
                throw new Error(`ramose/query: orderBy("${o.key}") — a sort key is a direct attribute column`);
            }
            out.push({ kind: "cell", cell, dir: o.dir, empty: o.empty });
            continue;
        }
        if (select !== undefined && !projectIds) {
            out.push(orderKeyFromSelectColumn(o.key, select, o.dir, o.empty));
            continue;
        }
        throw new Error(`ramose/query: orderBy("${o.key}") — the projection has no column "${o.key}"`);
    }
    return out;
};
const orderKeyFromSelectColumn = (key, select, dir, empty) => {
    let field = select[key];
    if (field === undefined) {
        throw new Error(`ramose/query: orderBy("${key}") — the select shape has no column "${key}"`);
    }
    while (typeof field === "object" &&
        field !== null &&
        (field._tag === "optional" ||
            field._tag === "default") &&
        "field" in field) {
        field = field.field;
    }
    if (typeof field !== "object" || field === null || typeof field.ident !== "string") {
        throw new Error(`ramose/query: orderBy("${key}") — a sort key is a direct attribute column`);
    }
    const carrier = field;
    const path = pathOf(carrier);
    if (cardsOf(carrier).includes("many")) {
        throw new Error(`ramose/query: orderBy(${path.join(" → ")}) crosses a cardinality-many attribute — the sort key would be a set, not a value`);
    }
    return { kind: "path", path, revs: revsOf(carrier), ref: isRefCarrier(carrier), dir, empty };
};
const resolveOrderKey = (st, select, extra) => {
    if (typeof st.key === "string" && extra !== undefined && extra[st.key] !== undefined) {
        return { kind: "cell", cell: extra[st.key], dir: st.dir, empty: st.empty };
    }
    if (typeof st.key === "string") {
        if (select === undefined) {
            throw new Error(`ramose/query: orderBy("${st.key}") names a selected column — select(...) first, or pass the attribute itself`);
        }
        if (select[st.key] === undefined) {
            throw new Error(`ramose/query: orderBy("${st.key}") — the select shape has no column "${st.key}"`);
        }
        if (extra !== undefined) {
            return { kind: "shapeKey", key: st.key, dir: st.dir, empty: st.empty };
        }
        return orderKeyFromSelectColumn(st.key, select, st.dir, st.empty);
    }
    const carrier = st.key;
    const path = pathOf(carrier);
    if (cardsOf(carrier).includes("many")) {
        throw new Error(`ramose/query: orderBy(${path.join(" → ")}) crosses a cardinality-many attribute — the sort key would be a set, not a value`);
    }
    return {
        kind: "path",
        path,
        revs: revsOf(carrier),
        ref: isRefCarrier(carrier),
        dir: st.dir,
        empty: st.empty,
    };
};
const isPathCarrier = (x) => typeof x === "object" && x !== null && typeof x.ident === "string";
const isRefCarrier = (carrier) => carrier.valueType === "ref";
const expandShapeToCells = (focus, shape, ctx, groupKeys, prefix = {
    path: [],
    revs: [],
}) => {
    const cells = {};
    for (const [key, field] of Object.entries(shape)) {
        const info = inspectPullField(field);
        const attr = info.attr;
        if (attr === undefined || typeof attr.ident !== "string") {
            throw new Error(`ramose/query: select(..., aggregates) field "${key}" is not an attribute`);
        }
        if (info.many) {
            throw new Error(`ramose/query: select(..., aggregates) cannot group by a cardinality-many field ("${key}")`);
        }
        if (isAgain(info.nestedPattern) || isAllShape(info.nestedPattern)) {
            throw new Error(`ramose/query: select(..., aggregates) cannot group by all(...) or again(...) ("${key}")`);
        }
        const path = [...prefix.path, ...pathOf(attr)];
        const revs = [...prefix.revs, ...revsOf(attr)];
        if (info.nestedPattern !== undefined && typeof info.nestedPattern === "object") {
            if (info.optional || info.hasDefault) {
                throw new Error(`ramose/query: select(..., aggregates) cannot group by an optional or defaulted nested shape ("${key}")`);
            }
            const target = mkVar("entity");
            const cmd = info.reverse ? Q.fact(target, attr, focus) : Q.fact(focus, attr, target);
            ctx.clauses.push(cmd);
            cells[key] = expandShapeToCells(target, info.nestedPattern, ctx, groupKeys, {
                path,
                revs,
            });
            continue;
        }
        const v = bindGroupKey(focus, attr, info, ctx);
        groupKeys.set(groupKeyId(path, revs), v);
        cells[key] = v;
    }
    return cells;
};
const bindGroupKey = (focus, attr, info, ctx) => {
    if (attr.ident === ":db/id") {
        const id = mkVar("id");
        ctx.clauses.push(Q.fact(focus, attr, id));
        return id;
    }
    const isRef = attr.valueType === "ref";
    const v = isRef ? mkVar("entity") : mkVar("value");
    if (info.optional || info.hasDefault) {
        const fallback = info.hasDefault ? info.defaultValue : null;
        const present = info.reverse
            ? function* () {
                yield* Q.fact(v, attr, focus);
            }
            : function* () {
                yield* Q.fact(focus, attr, v);
            };
        const missing = info.reverse
            ? function* () {
                yield* Q.fact(Q._, attr, focus);
            }
            : function* () {
                yield* Q.fact(focus, attr);
            };
        ctx.clauses.push({
            _tag: "orGroup",
            branches: [
                collectBody(present),
                collectBody(function* () {
                    yield* Q.not(missing);
                    yield* Q.in(v, [fallback]);
                }),
            ],
        });
        return v;
    }
    if (info.reverse) {
        ctx.clauses.push(Q.fact(v, attr, focus));
        return v;
    }
    const cmd = Q.fact(focus, attr);
    ctx.clauses.push(cmd);
    return cmd.handle.v;
};
const extendPath = (parent, leaf) => ({
    ident: leaf.ident,
    cardinality: leaf.cardinality,
    __path: [...pathOf(parent), ...pathOf(leaf)],
    __cards: [...cardsOf(parent), ...cardsOf(leaf)],
    __revs: [...revsOf(parent), ...revsOf(leaf)],
});
const rewriteExtra = (extra, focus) => {
    const out = {};
    for (const [key, cell] of Object.entries(extra)) {
        if (isAggSpec(cell)) {
            out[key] = isFocusSentinel(cell.v) ? { ...cell, v: focus } : cell;
            continue;
        }
        if (cell !== null && typeof cell === "object" && !isVar(cell) && !isPullSpec(cell) && !isValueSpec(cell)) {
            out[key] = rewriteExtra(cell, focus);
            continue;
        }
        throw new Error(`ramose/query: select(..., extras) cells are aggregates — "${key}" is not Q.count / Q.sum / …`);
    }
    return out;
};
const pullShapeCells = (shape, parent) => {
    const out = {};
    for (const [key, field] of Object.entries(shape)) {
        const info = inspectPullField(field);
        const attr = info.attr;
        const fromFocus = parent !== undefined && attr !== undefined && typeof attr.ident === "string"
            ? extendPath(parent, attr)
            : attr;
        if (info.nestedPattern !== undefined &&
            typeof info.nestedPattern === "object" &&
            !isAgain(info.nestedPattern) &&
            !isAllShape(info.nestedPattern)) {
            const nextParent = fromFocus !== undefined && typeof fromFocus.ident === "string" ? fromFocus : parent;
            out[key] = pullShapeCells(info.nestedPattern, nextParent);
        }
        else {
            out[key] = fromFocus ?? info.attr;
        }
    }
    return out;
};
const projectionCells = (proj) => {
    if (isValueSpec(proj))
        return proj.cell;
    if (isIdsSpec(proj))
        return { id: proj.v };
    if (isPullSpec(proj))
        return pullShapeCells(proj.shape);
    return isRowsSpec(proj) ? proj.cells : proj;
};
export const makeQueryObject = (body, stripCursor, take, seek, orders = [], limitN, offsetN) => {
    const self = {
        _tag: "Query",
        body,
        stripCursor,
        take,
        seek,
        orders,
        limitN,
        offsetN,
        open: (() => openCommand(self)),
        logic: () => makeQueryObject(body, true),
        orderBy: (key, dir = "asc", opts) => makeQueryObject(body, stripCursor, take, seek, [
            ...orders,
            { key, dir, empty: opts?.empty ?? "last" },
        ], limitN, offsetN),
        limit: (n) => makeQueryObject(body, stripCursor, take, seek, orders, n, offsetN),
        offset: (n) => makeQueryObject(body, stripCursor, take, seek, orders, limitN, n),
        one: () => {
            if (seek !== undefined) {
                throw new Error("ramose/query: one() unwraps a single row, and after(...) pages many — a paged query keeps its rows");
            }
            return makeQueryObject(body, stripCursor, "one", undefined, orders, limitN, offsetN);
        },
        oneOrFail: () => {
            if (seek !== undefined) {
                throw new Error("ramose/query: oneOrFail() unwraps a single row, and after(...) pages many — a paged query keeps its rows");
            }
            return makeQueryObject(body, stripCursor, "oneOrFail", undefined, orders, limitN, offsetN);
        },
        after: (cursor) => {
            if (take !== undefined) {
                throw new Error("ramose/query: one() / oneOrFail() answer a single row — there is no next page to cursor to");
            }
            if (cursor !== null && !isCursor(cursor)) {
                throw new Error("ramose/query: after(...) takes the previous page's cursor, or null for the first page");
            }
            return makeQueryObject(body, stripCursor, undefined, cursor, orders, limitN, offsetN);
        },
    };
    return self;
};
/**
 * Build a query. The body returns the projection; both the pipe and
 * generator spellings denote the same value. Put changing values in the
 * body as literals — `Query.q` takes one argument.
 */
export function q(body) {
    if (typeof body !== "function") {
        throw new Error("ramose/query: Query.q(body) takes a generator or a function returning a pipeline");
    }
    return makeQueryObject(body, false);
}
export const isRuleValue = (x) => typeof x === "function" && x._tag === "QueryRule";
const RULE_NAME = /^[A-Za-z][A-Za-z0-9_./-]*$/;
/**
 * `Query.rule(name, body)` — the named form of the head/body constructor.
 * The body's parameters are the bound head vars; a returned var joins the
 * head as the free position (promotion: an instantiated fragment becomes a
 * named engine rule in exactly this one mechanical call).
 */
export function rule(name, body) {
    if (!RULE_NAME.test(name)) {
        throw new Error(`ramose/query: "${name}" is not a rule name — use letters, digits, '_', '.', '/', '-', starting with a letter`);
    }
    let built;
    const ensureBuilt = () => {
        if (built)
            return built;
        const headVars = Array.from({ length: body.length }, () => mkVar("value"));
        const ctx = { clauses: [] };
        const ret = runBody(body(...headVars), ctx);
        let retVar;
        if (isVar(ret)) {
            if (headVars.includes(ret)) {
                throw new Error(`ramose/query: rule "${name}" returns one of its own arguments — a head var appears once; return a var the body binds`);
            }
            retVar = ret;
        }
        else if (ret !== undefined) {
            throw new Error(`ramose/query: rule "${name}" must return a bound var (its free head position) or nothing`);
        }
        built = { headVars, retVar, clauses: ctx.clauses };
        return built;
    };
    const apply = (...args) => {
        if (args.length !== body.length) {
            throw new Error(`ramose/query: rule "${name}" takes ${body.length} argument${body.length === 1 ? "" : "s"}, got ${args.length}`);
        }
        const ret = mkVar("value");
        const cmd = {
            _tag: "splice",
            splice: (ctx) => {
                const call = { _tag: "ruleCall", rule: self, args, ret };
                ctx.clauses.push(call);
                return ret;
            },
            [Symbol.iterator]() {
                let state = 0;
                return {
                    next: (v) => state === 0
                        ? ((state = 1), { done: false, value: cmd })
                        : { done: true, value: v },
                };
            },
        };
        return cmd;
    };
    const self = Object.assign(apply, { _tag: "QueryRule", ruleName: name, ensureBuilt });
    return self;
}
const openCommand = (qv) => {
    const cmd = {
        _tag: "splice",
        splice: (ctx) => {
            const built = runInto(qv, ctx, qv.stripCursor);
            const hasCursor = built.order.length > 0 ||
                built.limit !== undefined ||
                built.offset !== undefined ||
                qv.take !== undefined ||
                qv.seek !== undefined ||
                (!qv.stripCursor &&
                    (qv.orders.length > 0 || qv.limitN !== undefined || qv.offsetN !== undefined));
            if (hasCursor) {
                throw new Error("ramose/query: a query with a cursor (orderBy/limit/offset/one/after) does not delegate — the cursor is post-processing for the outermost query; extend then order, or strip it explicitly with q.logic()");
            }
            const cols = isIdsSpec(built.proj) ? { id: built.proj.v } : built.proj;
            const focus = built.focus ?? (isPullSpec(built.proj) ? built.proj.focus : undefined);
            if (focus === undefined) {
                throw new Error("ramose/query: q.open(...) needs the opened query's focus — a multi-root projection has none to hand back; open its parts instead");
            }
            return { focus, cols };
        },
        [Symbol.iterator]() {
            let state = 0;
            const self = cmd;
            return {
                next: (v) => state === 0
                    ? ((state = 1), { done: false, value: self })
                    : { done: true, value: v },
            };
        },
    };
    return cmd;
};
/**
 * Lift an enricher generator into a query transformer: the query-level
 * generics live here, never in user code. The enricher sees the opened
 * query's focus and returns extra cells for the row.
 */
export const enrich = (body) => (qv) => makeQueryObject(function* () {
    const { focus, cols } = (yield* openCommand(qv));
    const extra = yield* body(focus);
    return Q.row(cols, extra);
}, false);
/** Shape-preserving sibling of {@link enrich}: extra constraints, same row. */
export const refine = (frag) => (qv) => makeQueryObject(function* () {
    const { focus, cols } = (yield* openCommand(qv));
    yield* frag(focus);
    return cols;
}, false);
export const symbolicIdentityLowering = () => {
    const identities = [];
    return {
        lowering: { resolveEntity: (id) => -identities.push(id) },
        identities,
    };
};
const EMPTY_AGG = {
    count: 0,
    "count-distinct": 0,
    sum: 0,
    avg: null,
    min: null,
    max: null,
};
const unwrapEidLike = (v) => typeof v === "object" &&
    v !== null &&
    typeof v.id === "number" &&
    Object.keys(v).length === 1
    ? v.id
    : v;
const namedEntity = (v) => {
    if (typeof v !== "object" || v === null)
        return v;
    const id = v.id;
    return typeof id === "string" || typeof id === "number" ? id : v;
};
const isRefAttr = (attr) => attr !== undefined && attr.valueType === "ref";
const UNRESOLVED = Symbol("ramose/query/unplaceable-entity");
const regexSource = (re) => {
    if (typeof re === "string")
        return re;
    if (re.flags !== "") {
        throw new Error(`ramose/query: matches(/${re.source}/${re.flags}) — the peer compiles the pattern with no flags; express it in the pattern instead`);
    }
    return re.source;
};
export const lowerQueryAst = (qv) => lowerQueryObject(qv).query;
export const tryLowerQueryObject = (qv, lowering) => {
    try {
        return lowerQueryObject(qv, lowering);
    }
    catch (e) {
        if (e instanceof InvalidRequest)
            throw e;
        throw new InvalidRequest({
            message: e instanceof Error ? e.message : String(e),
        });
    }
};
export const lowerQueryObject = (qv, lowering) => {
    const entityId = lowering?.entity ?? ((eid) => makeEid(eid));
    let bindsEntities = false;
    resetGensym();
    const ctx = { clauses: [] };
    const built = runInto(qv, ctx, qv.stripCursor);
    const names = new Map();
    const kinds = new Map();
    let seq = 0;
    const nameOf = (v) => {
        let n = names.get(v.id);
        if (n === undefined) {
            n = `?q${seq++}`;
            names.set(v.id, n);
            kinds.set(n, v.kind);
        }
        return n;
    };
    let blanks = 0;
    const freshName = (prefix) => `?q${prefix}${blanks++}`;
    const byRule = new Map();
    const byNs = new Map();
    const takenNames = new Map();
    const ruleDefs = [];
    const claimName = (name, source) => {
        const holder = takenNames.get(name);
        if (holder !== undefined && holder !== source) {
            throw new Error(`ramose/query: two different rules named "${name}" reached one query — rule names are identities`);
        }
        takenNames.set(name, source);
    };
    const registerRule = (r) => {
        const seen = byRule.get(r);
        if (seen)
            return seen;
        const b = r.ensureBuilt();
        const entry = { wireName: r.ruleName, hasRet: b.retVar !== undefined };
        claimName(r.ruleName, r);
        byRule.set(r, entry);
        const headVars = b.retVar === undefined ? b.headVars : [...b.headVars, b.retVar];
        const head = [r.ruleName, ...headVars.map(nameOf)];
        const clauses = lowerClauses(b.clauses, varSet(headVars));
        ruleDefs.push([head, ...clauses]);
        return entry;
    };
    const registerMembership = (ns) => {
        const seen = byNs.get(ns);
        if (seen)
            return seen;
        const wireName = `is${ns.ns.charAt(0).toUpperCase()}${ns.ns.slice(1)}`.replace(/[^A-Za-z0-9_]/g, "_");
        claimName(wireName, ns);
        const entry = { wireName, hasRet: false };
        byNs.set(ns, entry);
        const e = freshName("m");
        if (ns._tag === "Trait") {
            const type = freshName("type");
            ruleDefs.push([
                [wireName, e],
                [e, RAMOSE_TYPE_IDENT, type],
                [["ramose-trait?", e, type, `:${ns.ns}`]],
            ]);
        }
        else {
            ruleDefs.push([[wireName, e], [e, RAMOSE_TYPE_IDENT, `:${ns.ns}`]]);
        }
        return entry;
    };
    const varSet = (vs) => new Set(vs.map((v) => v.id));
    const factVars = (c, into) => {
        const e = c.eVar ?? c.e0;
        if (isVar(e))
            into.add(e.id);
        const v = c.vVar ?? c.v0;
        if (isVar(v))
            into.add(v.id);
        if (c.txVar)
            into.add(c.txVar.id);
        if (c.opVar)
            into.add(c.opVar.id);
    };
    const clauseListVars = (list, into = new Set()) => {
        for (const c of list) {
            switch (c._tag) {
                case "fact":
                    factVars(c, into);
                    break;
                case "cmp":
                    for (const a of c.args)
                        if (isVar(a))
                            into.add(a.id);
                    break;
                case "fnBind":
                    for (const a of c.args)
                        if (isVar(a))
                            into.add(a.id);
                    into.add(c.ret.id);
                    break;
                case "memberOf":
                    into.add(c.v.id);
                    break;
                case "ruleCall":
                    for (const a of c.args)
                        if (isVar(a))
                            into.add(a.id);
                    into.add(c.ret.id);
                    break;
                case "orGroup":
                    c.branches.forEach((b) => clauseListVars(b, into));
                    break;
                case "notGroup":
                    clauseListVars(c.clauses, into);
                    break;
            }
        }
        return into;
    };
    const resolveIdentity = lowering?.resolveEntity;
    const lowerEntityConst = (v, use) => {
        const named = namedEntity(v);
        if (typeof named !== "string") {
            if (typeof named === "object" && named !== null && !Array.isArray(named)) {
                throw new InvalidRequest({
                    message: `ramose/query: ${use} takes an entity — an entity id, or the row cell that carries one`,
                });
            }
            return unwrapEidLike(named);
        }
        bindsEntities = true;
        if (resolveIdentity === undefined) {
            throw new InvalidRequest({
                message: `ramose/query: ${use} names an entity by its opaque identity, and an identity is only meaningful against the replica it was issued to — ask this question through a client's own query`,
            });
        }
        const eid = resolveIdentity(named);
        return eid === undefined ? UNRESOLVED : eid;
    };
    const refuseIdentity = (v, use) => {
        if (!isMutationRef(v))
            return;
        throw new InvalidRequest({
            message: `ramose/query: an entity identity is not a value for ${use} — only a reference holds an entity; compare the reference itself`,
        });
    };
    const lowerConst = (v, use, entity = false) => {
        if (entity)
            return lowerEntityConst(v, use);
        refuseIdentity(v, use);
        return unwrapEidLike(v);
    };
    const lowerPos = (v, use, entity = false) => {
        if (v === undefined || isBlank(v))
            return "_";
        if (isVar(v))
            return nameOf(v);
        if (isAggSpec(v)) {
            throw new Error(`ramose/query: an aggregate cell is not a value for ${use} — an aggregate exists only after grouping, as a projected cell or a top-level comparison operand`);
        }
        return lowerConst(v, use, entity);
    };
    const groundNothing = (name) => [["ground", []], [name, "..."]];
    const neverClause = () => groundNothing(freshName("n"));
    const lowerClauses = (list, outer) => {
        const out = [];
        for (const c of list) {
            switch (c._tag) {
                case "fact": {
                    const clauses = lowerFact(c);
                    if (clauses !== undefined)
                        out.push(...clauses);
                    break;
                }
                case "cmp":
                    out.push(...lowerCmp(c));
                    break;
                case "fnBind":
                    out.push([
                        [c.fn, ...c.args.map((a) => lowerPos(a, `Q.call("${c.fn}")`))],
                        nameOf(c.ret),
                    ]);
                    break;
                case "memberOf": {
                    const prefix = `:${c.ns.ns}/`;
                    const entailed = list.some((s) => s !== c &&
                        s._tag === "fact" &&
                        s.attr !== undefined &&
                        s.attr.ident.startsWith(prefix) &&
                        (s.eVar ?? s.e0) === c.v);
                    if (!entailed) {
                        const entry = registerMembership(c.ns);
                        out.push([entry.wireName, nameOf(c.v)]);
                    }
                    break;
                }
                case "ruleCall": {
                    const entry = registerRule(c.rule);
                    const args = c.args.map((a) => lowerPos(a, `rule ${entry.wireName}`));
                    if (entry.hasRet) {
                        out.push([entry.wireName, ...args, nameOf(c.ret)]);
                    }
                    else {
                        const usedElsewhere = (() => {
                            const rest = new Set();
                            clauseListVars(list.filter((s) => s !== c), rest);
                            return rest.has(c.ret.id) || outer.has(c.ret.id);
                        })();
                        if (usedElsewhere) {
                            throw new Error(`ramose/query: rule "${entry.wireName}" binds nothing — its application has no value to use`);
                        }
                        out.push([entry.wireName, ...args]);
                    }
                    break;
                }
                case "orGroup": {
                    if (c.branches.length === 0) {
                        out.push(neverClause());
                        break;
                    }
                    const inner = new Set();
                    c.branches.forEach((b) => clauseListVars(b, inner));
                    const rest = clauseListVars(list.filter((s) => s !== c));
                    const join = [...inner].filter((id) => rest.has(id) || outer.has(id));
                    const scope = new Set([...outer, ...rest]);
                    out.push([
                        "or-join",
                        join.map((id) => names.get(id) ?? nameOf(findVar(c, id))),
                        ...c.branches.map((b) => ["and", ...lowerClauses(b, scope)]),
                    ]);
                    break;
                }
                case "notGroup": {
                    const inner = clauseListVars(c.clauses);
                    const rest = clauseListVars(list.filter((s) => s !== c));
                    const join = [...inner].filter((id) => rest.has(id) || outer.has(id));
                    const scope = new Set([...outer, ...rest]);
                    const lowered = lowerClauses(c.clauses, scope);
                    if (lowered.length === 0) {
                        out.push(neverClause());
                        break;
                    }
                    out.push(["not-join", join.map((id) => names.get(id) ?? nameOf(findVar(c, id))), ...lowered]);
                    break;
                }
            }
        }
        return out;
    };
    const findVar = (group, id) => {
        let found;
        const scan = (list) => {
            for (const c of list) {
                if (found)
                    return;
                switch (c._tag) {
                    case "fact": {
                        const e = c.eVar ?? c.e0;
                        if (isVar(e) && e.id === id)
                            found = e;
                        const v = c.vVar ?? c.v0;
                        if (isVar(v) && v.id === id)
                            found = v;
                        if (c.txVar?.id === id)
                            found = c.txVar;
                        if (c.opVar?.id === id)
                            found = c.opVar;
                        break;
                    }
                    case "cmp":
                        for (const a of c.args)
                            if (isVar(a) && a.id === id)
                                found = a;
                        break;
                    case "fnBind":
                        for (const a of c.args)
                            if (isVar(a) && a.id === id)
                                found = a;
                        if (c.ret.id === id)
                            found = c.ret;
                        break;
                    case "memberOf":
                        if (c.v.id === id)
                            found = c.v;
                        break;
                    case "ruleCall":
                        for (const a of c.args)
                            if (isVar(a) && a.id === id)
                                found = a;
                        if (c.ret.id === id)
                            found = c.ret;
                        break;
                    case "orGroup":
                        c.branches.forEach(scan);
                        break;
                    case "notGroup":
                        scan(c.clauses);
                        break;
                }
            }
        };
        scan([group]);
        if (!found)
            throw new Error("ramose/query: internal — join var not found in its group");
        return found;
    };
    const isWireVar = (x) => typeof x === "string" && x.startsWith("?");
    const lowerIdFact = (c) => {
        if (c.txVar !== undefined || c.opVar !== undefined) {
            throw new Error("ramose/query: :db/id is the entity's identity, not a datom — it has no tx or op position");
        }
        const ePos = c.eVar ?? c.e0;
        const vPos = c.vVar ?? c.v0;
        if (isVar(ePos) && isVar(vPos)) {
            const eName = names.get(ePos.id);
            const vName = names.get(vPos.id);
            if (eName !== undefined && vName !== undefined) {
                return eName === vName ? undefined : [[["identity", eName], vName]];
            }
            const n = eName ?? vName ?? nameOf(ePos);
            names.set(ePos.id, n);
            names.set(vPos.id, n);
            return undefined;
        }
        const e = lowerPos(ePos, "an entity position", true);
        const v = lowerPos(vPos, ":db/id's value", true);
        if (e === UNRESOLVED || v === UNRESOLVED) {
            const bound = [e, v].find(isWireVar);
            return [bound === undefined ? neverClause() : groundNothing(bound)];
        }
        if (e === v || e === "_" || v === "_")
            return undefined;
        if (isWireVar(e) && !isWireVar(v))
            return [[["ground", v], e]];
        if (isWireVar(v) && !isWireVar(e))
            return [[["ground", e], v]];
        return [neverClause()];
    };
    const lowerFact = (c) => {
        if (c.attr?.ident === ":db/id")
            return lowerIdFact(c);
        const e = lowerPos(c.eVar ?? c.e0, "an entity position", true);
        const attr = c.attr?.ident ?? "_";
        const v = lowerPos(c.vVar ?? c.v0, attr === "_" ? "a value position" : `${attr}'s value`, isRefAttr(c.attr));
        const unplaced = e === UNRESOLVED || v === UNRESOLVED;
        const clause = [
            e === UNRESOLVED ? freshName("u") : e,
            attr,
            v === UNRESOLVED ? freshName("u") : v,
        ];
        if (c.txVar !== undefined || c.opVar !== undefined) {
            clause.push(c.txVar !== undefined ? nameOf(c.txVar) : "_");
        }
        if (c.opVar !== undefined)
            clause.push(nameOf(c.opVar));
        return unplaced ? [clause, neverClause()] : [clause];
    };
    const lowerCmp = (c) => {
        const { op, args, ignoreCase } = c;
        const tSided = args.some((a) => isVar(a) && a.kind === "t");
        const entitySided = args.some((a) => isVar(a) && (a.kind === "entity" || a.kind === "id"));
        const use = `the comparison "${op}"`;
        const operand = (a) => {
            if (isAggSpec(a)) {
                throw new Error("ramose/query: a comparison over an aggregate cell cannot appear inside Q.or / Q.not or a rule body — :having filters whole groups, and there is no group where those lower; write it at the query's top level");
            }
            if (isVar(a))
                return nameOf(a);
            let v = a;
            if (op === "re-find?")
                return regexSource(v);
            if (op === "in") {
                if (!Array.isArray(v))
                    throw new Error(`ramose/query: Q.in takes an array of values, got ${String(v)}`);
                return v.map((member) => lowerConst(member, use, entitySided));
            }
            v = lowerConst(v, use, entitySided);
            if (tSided && typeof v === "number")
                return TX_BASE + v;
            return v;
        };
        if (op === "in") {
            const [subject, list] = args;
            if (!isVar(subject)) {
                throw new Error("ramose/query: Q.in's first argument is a bound var");
            }
            const values = operand(list).filter((value) => value !== UNRESOLVED);
            return [[["ground", values], [nameOf(subject), "..."]]];
        }
        if (ignoreCase) {
            if (args.some(isAggSpec)) {
                throw new Error("ramose/query: ignoreCase cannot wrap an aggregate comparison — :having does not bind functions; write the comparison at the query's top level without ignoreCase, or fold through Q.call(\"lower-case\") before aggregating");
            }
            const extras = [];
            const folded = args.map((a) => {
                if (isVar(a)) {
                    const out = freshName("l");
                    extras.push([["lower-case", nameOf(a)], out]);
                    return out;
                }
                if (isBlank(a) || a === undefined) {
                    throw new Error("ramose/query: ignoreCase needs a bound var or a string on each side");
                }
                const v = lowerConst(a, use);
                if (typeof v !== "string") {
                    throw new Error("ramose/query: ignoreCase applies to strings");
                }
                return v.toLowerCase();
            });
            return [...extras, [[op, ...folded]]];
        }
        const operands = args.map(operand);
        if (operands.includes(UNRESOLVED))
            return [neverClause()];
        return [[[op, ...operands]]];
    };
    const clauses = built.clauses;
    const havingCmps = [];
    const rowClauses = [];
    for (const c of clauses) {
        if (c._tag === "cmp" && c.args.some(isAggSpec)) {
            if (c.ignoreCase) {
                throw new Error("ramose/query: ignoreCase cannot wrap an aggregate comparison — :having does not bind functions");
            }
            havingCmps.push(c);
        }
        else
            rowClauses.push(c);
    }
    const nameCells = havingCmps.length > 0;
    const aggKey = (a) => {
        const id = isFocusSentinel(a.v) && built.focus !== undefined ? built.focus.id : a.v.id;
        return `${a.fn}:${id}`;
    };
    const aggAlias = new Map();
    const emptyCells = new Map();
    const plainCellVars = new Set();
    const where = [];
    const flats = [];
    const find = [];
    const readVar = (v) => {
        switch (v.kind) {
            case "entity":
            case "tx":
                return (cell) => typeof cell === "number"
                    ? { id: v.kind === "entity" ? entityId(cell) : makeEid(cell) }
                    : cell;
            case "id":
                return (cell) => (typeof cell === "number" ? entityId(cell) : cell);
            case "t":
                return (cell) => (typeof cell === "number" ? cell - TX_BASE : cell);
            default:
                return (cell) => cell;
        }
    };
    const readAgg = (fn, v) => {
        if (fn !== "min" && fn !== "max")
            return (cell) => cell;
        switch (v.kind) {
            case "entity":
            case "id":
                return (cell) => (typeof cell === "number" ? entityId(cell) : cell);
            case "t":
                return (cell) => (typeof cell === "number" ? cell - TX_BASE : cell);
            default:
                return (cell) => cell;
        }
    };
    const flattenCell = (path, cell) => {
        if (isVar(cell)) {
            plainCellVars.add(cell.id);
            flats.push({ path, elem: nameOf(cell), read: readVar(cell) });
            return;
        }
        if (isAggSpec(cell)) {
            const v = isFocusSentinel(cell.v)
                ? built.focus ??
                    (() => {
                        throw new Error("ramose/query: Q.focus needs a select focus — use it in .select(shape, extras) or Q.pull");
                    })()
                : cell.v;
            const read = readAgg(cell.fn, v);
            let elem = [cell.fn, nameOf(v)];
            if (nameCells) {
                const alias = aggAlias.get(aggKey(cell)) ?? freshName("h");
                aggAlias.set(aggKey(cell), alias);
                emptyCells.set(alias, EMPTY_AGG[cell.fn]);
                elem = ["as", elem, alias];
            }
            flats.push({ path, elem, read, agg: cell.fn });
            return;
        }
        if (isPullSpec(cell)) {
            if (nameCells) {
                throw new Error("ramose/query: an aggregate-cell comparison and Q.pull cannot share a projection — the server's :having names find cells and a pull is not one; project bound vars beside the aggregate instead");
            }
            const map = shapeToPullMap(cell.shape);
            const focus = nameOf(cell.focus);
            where.push(...requiredClauses(focus, map));
            flats.push({
                path,
                elem: ["pull", focus, lowerPullPattern(map)],
                read: (c) => mapPullEntityIds(map, reshapePullResult(map, c), entityId),
                plan: pullReshapeIdentity(map),
            });
            return;
        }
        if (isDistinctSpec(cell)) {
            throw new Error("ramose/query: Q.distinct(...) wraps the whole projection, not one cell");
        }
        if (typeof cell === "object" && cell !== null) {
            for (const [k, sub] of Object.entries(cell)) {
                flattenCell([...path, k], sub);
            }
            return;
        }
        throw new Error(`ramose/query: projection cell at ${path.join(".") || "<root>"} is not a bound handle, Q.pull, or an aggregate`);
    };
    let finalizeRows;
    let scalar = false;
    let projection = "rows";
    let rootPlan = null;
    const proj = built.proj;
    if (isValueSpec(proj)) {
        projection = "value";
        flattenCell(["$"], proj.cell);
        find.push(flats[0].elem, ".");
        scalar = true;
        const aggFn = flats[0].agg;
        finalizeRows = (raw) => {
            const empty = aggFn !== undefined ? EMPTY_AGG[aggFn] : null;
            if (raw.length === 0)
                return aggFn !== undefined && emptyRowPasses() ? [empty] : [];
            return raw;
        };
    }
    else if (isIdsSpec(proj)) {
        projection = "ids";
        find.push(nameOf(proj.v));
        finalizeRows = (tuples) => tuples.map((t) => typeof t[0] === "number" ? { id: entityId(t[0]) } : t[0]);
    }
    else if (isPullSpec(proj)) {
        projection = "pull";
        const map = shapeToPullMap(proj.shape);
        rootPlan = pullReshapeIdentity(map);
        const focus = nameOf(proj.focus);
        where.push(...requiredClauses(focus, map));
        find.push(["pull", focus, lowerPullPattern(map)]);
        finalizeRows = (tuples) => tuples.map((t) => mapPullEntityIds(map, reshapePullResult(map, t[0]), entityId));
    }
    else {
        const cells = isRowsSpec(proj) ? proj.cells : proj;
        for (const [k, cell] of Object.entries(cells))
            flattenCell([k], cell);
        find.push(...flats.map((f) => f.elem));
        const aggOnly = flats.length > 0 && flats.every((f) => f.agg !== undefined);
        finalizeRows = (raw) => (raw.length === 0 && aggOnly && emptyRowPasses() ? [flats.map((f) => EMPTY_AGG[f.agg])] : raw).map((t) => {
            const row = {};
            flats.forEach((f, i) => {
                const value = f.read(t[i]);
                let at = row;
                for (let d = 0; d < f.path.length - 1; d++) {
                    const k = f.path[d];
                    at = (at[k] ??= {});
                }
                const leaf = f.path[f.path.length - 1];
                if (leaf === "…") {
                    Object.assign(at, value);
                }
                else {
                    at[leaf] = value;
                }
            });
            return row;
        });
    }
    const projVars = new Set();
    const provenanceVars = new Set();
    const addProvenance = (v) => {
        if (v.kind !== "entity" && v.kind !== "tx")
            provenanceVars.add(v.id);
    };
    const collectProjVars = (cell) => {
        if (isVar(cell)) {
            projVars.add(cell.id);
            if (!built.distinct)
                addProvenance(cell);
        }
        else if (isAggSpec(cell)) {
            const v = isFocusSentinel(cell.v) ? (built.focus ?? cell.v) : cell.v;
            projVars.add(v.id);
            addProvenance(v);
        }
        else if (isPullSpec(cell))
            projVars.add(cell.focus.id);
        else if (isDistinctSpec(cell)) {
            throw new Error("ramose/query: Q.distinct(...) wraps the whole projection, not one cell");
        }
        else if (typeof cell === "object" && cell !== null) {
            for (const sub of Object.values(cell))
                collectProjVars(sub);
        }
    };
    if (isIdsSpec(proj))
        projVars.add(proj.v.id);
    else if (isPullSpec(proj))
        projVars.add(proj.focus.id);
    else if (isValueSpec(proj))
        collectProjVars(proj.cell);
    else
        collectProjVars(isRowsSpec(proj) ? proj.cells : proj);
    where.unshift(...lowerClauses(rowClauses, projVars));
    const havingCellName = (a) => {
        const alias = aggAlias.get(aggKey(a));
        if (alias === undefined) {
            throw new Error(`ramose/query: Q.${a.fn === "count-distinct" ? "countDistinct" : a.fn}(...) is compared but never projected — a post-group filter names an aggregate cell of the row, so the same cell value must reach the projection`);
        }
        return alias;
    };
    const lowerHavingCmp = (c) => {
        const tSided = c.args.some((a) => (isVar(a) && a.kind === "t") ||
            (isAggSpec(a) && a.v.kind === "t" && (a.fn === "min" || a.fn === "max")));
        const operand = (a) => {
            if (isAggSpec(a))
                return havingCellName(a);
            if (isVar(a)) {
                if (!plainCellVars.has(a.id)) {
                    throw new Error("ramose/query: a post-group comparison sees the group's row, so a var beside the aggregate cell must be a projected cell of it — project the var, or compare against a literal");
                }
                return nameOf(a);
            }
            let v = a;
            const use = `the post-group comparison "${c.op}"`;
            if (c.op === "re-find?")
                return regexSource(v);
            if (c.op === "in") {
                if (!Array.isArray(v))
                    throw new Error(`ramose/query: Q.in takes an array of values, got ${String(v)}`);
                return v.map((member) => lowerConst(member, use));
            }
            v = lowerConst(v, use);
            if (tSided && typeof v === "number")
                return TX_BASE + v;
            return v;
        };
        return [[c.op, ...c.args.map(operand)]];
    };
    const having = havingCmps.map(lowerHavingCmp);
    const emptyRowPasses = () => having.every((clause) => {
        const [op, ...args] = clause[0];
        const vals = args.map((a) => (typeof a === "string" && emptyCells.has(a) ? emptyCells.get(a) : a));
        if (op === "in") {
            const [v, list] = vals;
            return Array.isArray(list) && list.some((x) => vkey(x) === vkey(v));
        }
        const f = PREDICATES[op];
        return f !== undefined && Boolean(f(...vals));
    });
    const withVars = [];
    if (provenanceVars.size > 0) {
        const walkGroups = (list, visit) => {
            for (const c of list) {
                visit(c);
                if (c._tag === "orGroup")
                    c.branches.forEach((b) => walkGroups(b, visit));
            }
        };
        const fnBindArgs = new Map();
        walkGroups(clauses, (c) => {
            if (c._tag === "fnBind")
                fnBindArgs.set(c.ret.id, c.args);
        });
        const rideableDirect = [];
        const queue = [...provenanceVars];
        for (let i = 0; i < queue.length; i++) {
            const args = fnBindArgs.get(queue[i]);
            if (args === undefined)
                continue;
            for (const a of args) {
                if (!isVar(a))
                    continue;
                if (a.kind === "entity" || a.kind === "tx") {
                    rideableDirect.push(a);
                    continue;
                }
                if (!provenanceVars.has(a.id)) {
                    provenanceVars.add(a.id);
                    queue.push(a.id);
                }
            }
        }
        const topLevelBound = new Set();
        for (const c of clauses) {
            switch (c._tag) {
                case "fact":
                    factVars(c, topLevelBound);
                    break;
                case "fnBind":
                    for (const a of c.args)
                        if (isVar(a))
                            topLevelBound.add(a.id);
                    topLevelBound.add(c.ret.id);
                    break;
                case "memberOf":
                    topLevelBound.add(c.v.id);
                    break;
                case "ruleCall":
                    for (const a of c.args)
                        if (isVar(a))
                            topLevelBound.add(a.id);
                    topLevelBound.add(c.ret.id);
                    break;
                case "orGroup": {
                    const inner = new Set();
                    c.branches.forEach((b) => clauseListVars(b, inner));
                    const rest = clauseListVars(clauses.filter((s) => s !== c));
                    for (const id of inner) {
                        if (rest.has(id) || projVars.has(id) || topLevelBound.has(id)) {
                            topLevelBound.add(id);
                        }
                    }
                    break;
                }
            }
        }
        const seen = new Set();
        const ride = (e, requireBound) => {
            if (!isVar(e) || projVars.has(e.id) || seen.has(e.id))
                return;
            if (requireBound && !topLevelBound.has(e.id))
                return;
            seen.add(e.id);
            withVars.push(nameOf(e));
        };
        for (const v of rideableDirect)
            ride(v, true);
        const walkFacts = (list, nested) => {
            for (const c of list) {
                if (c._tag === "fact") {
                    const v = c.vVar ?? c.v0;
                    const bindsValue = (isVar(v) && provenanceVars.has(v.id)) ||
                        (c.txVar !== undefined && provenanceVars.has(c.txVar.id)) ||
                        (c.opVar !== undefined && provenanceVars.has(c.opVar.id));
                    if (!bindsValue)
                        continue;
                    ride(c.eVar ?? c.e0, nested);
                }
                else if (c._tag === "orGroup") {
                    c.branches.forEach((b) => walkFacts(b, true));
                }
            }
        };
        walkFacts(clauses, false);
    }
    const order = [];
    const queryAggregates = flats.some((f) => f.agg !== undefined);
    const bindOrderPath = (path, revs, ref, dir, empty) => {
        const group = built.groupKeys.get(groupKeyId(path, revs));
        if (group !== undefined) {
            order.push({ var: nameOf(group), dir, empty });
            return;
        }
        if (queryAggregates) {
            throw new Error(`ramose/query: orderBy(${path.join(" → ")}) is not a group key of this select — an aggregate query orders only by a projected cell`);
        }
        if (built.focus === undefined) {
            throw new Error("ramose/query: orderBy(attribute) needs a select focus — order a multi-root projection by a projected cell or bound var");
        }
        const bound = lowerOrderPath(nameOf(built.focus), path, revs);
        if (!kinds.has(bound.var))
            kinds.set(bound.var, ref ? "entity" : "value");
        where.push(...bound.clauses);
        order.push({ var: bound.var, dir, empty });
    };
    const orderFromPicked = (picked, label, dir, empty) => {
        if (isVar(picked)) {
            const v = isFocusSentinel(picked)
                ? built.focus ??
                    (() => {
                        throw new Error("ramose/query: Q.focus needs a select focus — order a projected cell instead");
                    })()
                : picked;
            order.push({ var: nameOf(v), dir, empty });
            return;
        }
        if (isAggSpec(picked)) {
            const v = isFocusSentinel(picked.v)
                ? built.focus ??
                    (() => {
                        throw new Error("ramose/query: Q.focus needs a select focus — order a projected cell instead");
                    })()
                : picked.v;
            order.push({ var: nameOf(v), dir, empty });
            return;
        }
        if (isPathCarrier(picked)) {
            if (cardsOf(picked).includes("many")) {
                throw new Error(`ramose/query: orderBy(${pathOf(picked).join(" → ")}) crosses a cardinality-many attribute — the sort key would be a set, not a value`);
            }
            bindOrderPath(pathOf(picked), revsOf(picked), isRefCarrier(picked), dir, empty);
            return;
        }
        throw new Error(`ramose/query: ${label} did not pick a bound var, projected cell, or attribute`);
    };
    const lookupCell = (tree, key) => {
        if (tree !== null && typeof tree === "object" && !Array.isArray(tree)) {
            return tree[key];
        }
        return undefined;
    };
    if (built.order.length > 0) {
        for (const o of built.order) {
            if (o.kind === "cell") {
                orderFromPicked(o.cell, "orderBy", o.dir, o.empty);
            }
            else if (o.kind === "path") {
                bindOrderPath(o.path, o.revs, o.ref, o.dir, o.empty);
            }
            else {
                throw new Error("ramose/query: orderBy leftover is not a projected cell or attribute path");
            }
        }
    }
    if (!qv.stripCursor) {
        const cells = projectionCells(proj);
        for (const o of qv.orders) {
            let picked = o.key;
            if (typeof o.key === "function") {
                picked = o.key(cells);
            }
            else if (typeof o.key === "string") {
                picked = lookupCell(cells, o.key);
                if (picked === undefined) {
                    throw new Error(`ramose/query: orderBy("${o.key}") — the projection has no column "${o.key}"`);
                }
            }
            orderFromPicked(picked, "orderBy", o.dir, o.empty);
        }
    }
    if (isValueSpec(proj) && (order.length > 0 || qv.limitN !== undefined || qv.offsetN !== undefined || qv.seek !== undefined)) {
        throw new Error("ramose/query: Q.value is a single value — orderBy / limit / offset / after page rows");
    }
    const boundCount = (n, what) => {
        if (n === undefined)
            return undefined;
        if (!Number.isInteger(n) || n < 0) {
            throw new Error(`ramose/query: ${what} takes a non-negative integer, got ${String(n)}`);
        }
        return n;
    };
    const take = qv.stripCursor ? undefined : qv.take;
    const seek = qv.stripCursor ? undefined : qv.seek;
    const limit = take === "one"
        ? 1
        : take === "oneOrFail"
            ? 2
            : boundCount(qv.stripCursor ? undefined : (qv.limitN ?? built.limit), "limit");
    const offset = boundCount(qv.stripCursor ? undefined : (qv.offsetN ?? built.offset), "offset");
    const pagedVars = [];
    const pagedEntities = [];
    if (seek !== undefined) {
        if (offset !== undefined) {
            throw new Error("ramose/query: after(...) and offset both say where the page starts — a cursor already is the offset");
        }
        if (order.length === 0) {
            throw new Error("ramose/query: after(...) pages a sorted query — add an orderBy for the cursor to be a position in");
        }
        if (built.focus === undefined) {
            throw new Error("ramose/query: after(...) pages by a root entity's id as tie-breaker — a multi-root projection has no paging root");
        }
        const root = nameOf(built.focus);
        if (!order.some((o) => o.var === root)) {
            order.push({ var: root, dir: "asc", empty: "last" });
        }
        pagedVars.push(...order.map((o) => o.var));
        pagedEntities.push(...order.map((o) => kinds.get(o.var) === "entity" || kinds.get(o.var) === "id"));
        if (seek !== null && seek.keys.length !== order.length) {
            throw new Error(`ramose/query: this cursor does not fit — it carries ${seek.keys.length} sort-key values and the query orders by ${order.length}; a cursor only continues the query that minted it`);
        }
        find.push(...pagedVars);
    }
    const baseLen = find.length - pagedVars.length;
    const resolveCursorCell = (key, index) => {
        if (pagedEntities[index] !== true)
            return key;
        const resolve = lowering?.resolveEntity;
        if (resolve === undefined)
            return key;
        bindsEntities = true;
        const eid = resolve(key);
        if (eid === undefined) {
            throw new InvalidRequest({
                message: "ramose/query: this cursor names an entity this client cannot resolve — a cursor only continues the page that minted it, on the replica that minted it",
            });
        }
        return eid;
    };
    const query = {
        find,
        where,
        ...(withVars.length > 0 ? { with: withVars } : {}),
        ...(having.length > 0 ? { having } : {}),
        ...(ruleDefs.length > 0 ? { rules: ruleDefs } : {}),
        ...(order.length > 0 ? { order } : {}),
        ...(seek !== undefined && seek !== null
            ? { after: seek.keys.map((key, index) => resolveCursorCell(key, index)) }
            : {}),
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
    };
    const rowShape = JSON.stringify({
        projection,
        root: rootPlan,
        cells: flats.map((cell) => [cell.path, cell.agg ?? null, cell.plan ?? null]),
        scalar,
    });
    return {
        query,
        bindsEntities,
        result: seek !== undefined ? "page" : take !== undefined ? "row" : "rows",
        rowShape,
        shape: JSON.stringify({
            row: rowShape,
            take: take ?? null,
            paged: seek !== undefined,
        }),
        finalize: (result) => {
            if (scalar) {
                const cell = flats[0];
                const empty = cell.agg !== undefined ? EMPTY_AGG[cell.agg] : null;
                if (result === null || result === undefined) {
                    return cell.agg !== undefined && emptyRowPasses() ? cell.read(empty) : null;
                }
                if (Array.isArray(result)) {
                    const first = result[0];
                    const raw = Array.isArray(first) ? first[0] : first;
                    if (raw === undefined) {
                        return cell.agg !== undefined && emptyRowPasses() ? cell.read(empty) : null;
                    }
                    return cell.read(raw);
                }
                return cell.read(result);
            }
            const tuples = Array.isArray(result) ? result : [];
            const rows = finalizeRows(tuples);
            if (seek !== undefined) {
                const last = tuples[tuples.length - 1];
                return {
                    rows,
                    cursor: !Array.isArray(last) ||
                        (typeof limit === "number" && tuples.length < limit)
                        ? null
                        : {
                            _tag: "Cursor",
                            keys: last.slice(baseLen).map((key, index) => pagedEntities[index] === true && typeof key === "number"
                                ? entityId(key)
                                : key),
                        },
                };
            }
            if (take !== undefined) {
                if (take === "one")
                    return rows[0] ?? null;
                if (rows.length === 1)
                    return rows[0];
                return new NotOne({
                    message: rows.length === 0
                        ? "ramose/query: expected exactly one row, found none"
                        : "ramose/query: expected exactly one row, found 2",
                    found: rows.length === 0 ? 0 : 2,
                });
            }
            return rows;
        },
    };
};
//# sourceMappingURL=query.js.map