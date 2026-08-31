import { FUNCTIONS } from "../../internal/core/query/builtins.js";
let nextVarId = 1;
export const mkVar = (kind = "value", ns) => ({ _tag: "QVar", id: nextVarId++, kind, ns });
export const isVar = (x) => typeof x === "object" && x !== null && x._tag === "QVar";
const BLANK = { _tag: "QBlank" };
export const isBlank = (x) => typeof x === "object" && x !== null && x._tag === "QBlank";
function yieldSelf(self) {
    let state = 0;
    return {
        next(v) {
            if (state === 0) {
                state = 1;
                return { done: false, value: self };
            }
            return { done: true, value: v };
        },
    };
}
const toGen = (b) => {
    if (typeof b === "function")
        return b();
    if (typeof b.next !== "function") {
        return b[Symbol.iterator]();
    }
    return b;
};
export const runBody = (gen, ctx) => {
    let step = gen.next();
    while (!step.done) {
        step = gen.next(dispatch(step.value, ctx));
    }
    return step.value;
};
export const collectBody = (b) => {
    const ctx = { clauses: [] };
    runBody(toGen(b), ctx);
    return ctx.clauses;
};
const dispatch = (cmd, ctx) => {
    switch (cmd._tag) {
        case "fact":
            ctx.clauses.push(cmd);
            return cmd.handle;
        case "cmp":
            ctx.clauses.push(cmd);
            return undefined;
        case "fnBind":
            ctx.clauses.push(cmd);
            return cmd.ret;
        case "or":
            ctx.clauses.push({ _tag: "orGroup", branches: cmd.branches.map(collectBody) });
            return undefined;
        case "not":
            ctx.clauses.push({ _tag: "notGroup", clauses: collectBody(cmd.body) });
            return undefined;
        case "member": {
            const v = mkVar("entity", cmd.ns.ns);
            ctx.clauses.push({ _tag: "memberOf", ns: cmd.ns, v });
            return v;
        }
        case "splice":
            return cmd.splice(ctx);
    }
};
export const isPullSpec = (x) => typeof x === "object" && x !== null && x._tag === "pullSpec";
export const isRowsSpec = (x) => typeof x === "object" && x !== null && x._tag === "rowsSpec";
export const isAggSpec = (x) => typeof x === "object" && x !== null && x._tag === "aggSpec";
export const isValueSpec = (x) => typeof x === "object" && x !== null && x._tag === "valueSpec";
export const isDistinctSpec = (x) => typeof x === "object" && x !== null && x._tag === "distinctSpec";
export const FOCUS = Object.freeze({
    _tag: "QVar",
    id: -1,
    kind: "entity",
});
export const isFocusSentinel = (v) => isVar(v) && v.id === -1;
const factHandle = (cmd) => ({
    get e() {
        if (cmd.eVar === undefined) {
            cmd.eVar = isVar(cmd.e0)
                ? cmd.e0
                : mkVar("entity", cmd.attr === undefined ? undefined : nsOfIdent(cmd.attr.ident));
        }
        return cmd.eVar;
    },
    get v() {
        if (cmd.vVar === undefined) {
            cmd.vVar = isVar(cmd.v0)
                ? cmd.v0
                : mkVar(isRefAttr(cmd.attr) ? "entity" : "value", refTargetNs(cmd.attr));
        }
        return cmd.vVar;
    },
    get t() {
        if (cmd.txVar === undefined) {
            cmd.txVar = mkVar("t");
            cmd.txKind = "t";
        }
        else if (cmd.txKind !== "t") {
            throw new Error("ramose/query: read f.t or f.tx, not both — they are the same position read two ways");
        }
        return cmd.txVar;
    },
    get tx() {
        if (cmd.txVar === undefined) {
            cmd.txVar = mkVar("tx");
            cmd.txKind = "tx";
        }
        else if (cmd.txKind !== "tx") {
            throw new Error("ramose/query: read f.t or f.tx, not both — they are the same position read two ways");
        }
        return cmd.txVar;
    },
    get op() {
        cmd.opVar ??= mkVar("op");
        return cmd.opVar;
    },
});
const nsOfIdent = (ident) => /^:([^/]+)\//.exec(ident)?.[1];
const isRefAttr = (attr) => attr !== undefined && attr.valueType === "ref";
const refTargetNs = (attr) => {
    if (!isRefAttr(attr))
        return undefined;
    const schema = attr.schema;
    const resolve = schema?._resolve;
    if (typeof resolve !== "function")
        return undefined;
    try {
        const ns = resolve()?.ns;
        return typeof ns === "string" ? ns : undefined;
    }
    catch {
        return undefined;
    }
};
const cmp = (op, args, ignoreCase = false) => ({
    _tag: "cmp",
    op,
    args,
    ...(ignoreCase ? { ignoreCase: true } : {}),
    [Symbol.iterator]() {
        return yieldSelf(this);
    },
});
const stringPred = (op) => (v, needle, opts) => cmp(op, [v, needle], opts?.ignoreCase === true);
const fnBind = (fn, args) => {
    if (typeof fn !== "string" || fn.length === 0 || !Object.hasOwn(FUNCTIONS, fn)) {
        throw new Error(`ramose/query: Q.call(${JSON.stringify(fn)}) is not an engine function — the documented builtins are the names Q.call accepts`);
    }
    const ret = mkVar("value");
    return {
        _tag: "fnBind",
        fn,
        args,
        ret,
        [Symbol.iterator]() {
            return yieldSelf(this);
        },
    };
};
const factImpl = (e, attr, v) => {
    const a = attr === undefined || isBlank(attr) ? undefined : attr;
    if (a !== undefined && typeof a.ident !== "string") {
        throw new Error("ramose/query: Q.fact's attr position takes an attribute reference (Issue.title) or Q._");
    }
    const cmd = {
        _tag: "fact",
        e0: e,
        attr: a,
        v0: v,
    };
    cmd.handle = factHandle(cmd);
    cmd[Symbol.iterator] = function () {
        return yieldSelf(this);
    };
    if (isVar(e) && a !== undefined && e.ns === undefined)
        e.ns = nsOfIdent(a.ident);
    return cmd;
};
const fact = (e, attr, v) => factImpl(e, attr, v);
const agg = (fn, v) => {
    if (!isVar(v)) {
        throw new Error(`ramose/query: Q.${fn === "count-distinct" ? "countDistinct" : fn}(...) aggregates a bound var`);
    }
    return { _tag: "aggSpec", fn, v };
};
const distinctInner = (proj) => {
    if (isDistinctSpec(proj))
        return proj.inner;
    if (isValueSpec(proj)) {
        throw new Error("ramose/query: Q.distinct(...) wraps a row projection — Q.value is a scalar, not a set of rows");
    }
    if (isPullSpec(proj) || isRowsSpec(proj))
        return proj;
    if (isVar(proj) ||
        isAggSpec(proj) ||
        isBlank(proj) ||
        proj === null ||
        typeof proj !== "object" ||
        Array.isArray(proj)) {
        throw new Error("ramose/query: Q.distinct(...) wraps a row projection — Q.pull, Q.rows({ … }), or a record of bound handles");
    }
    const tag = proj._tag;
    if (typeof tag === "string") {
        throw new Error("ramose/query: Q.distinct(...) wraps a row projection — Q.pull, Q.rows({ … }), or a record of bound handles");
    }
    if (Object.keys(proj).length === 0) {
        throw new Error("ramose/query: the body returned an empty projection — name at least one cell");
    }
    return proj;
};
/**
 * The kernel, as one namespace. Everything here is an inert description;
 * `db.query` is where computation (and Effect) begins.
 */
export const Q = {
    fact,
    var: () => mkVar("value"),
    _: BLANK,
    eq: (a, b) => cmp("=", [a, b]),
    ne: (a, b) => cmp("not=", [a, b]),
    lt: (a, b) => cmp("<", [a, b]),
    lte: (a, b) => cmp("<=", [a, b]),
    gt: (a, b) => cmp(">", [a, b]),
    gte: (a, b) => cmp(">=", [a, b]),
    startsWith: stringPred("starts-with?"),
    endsWith: stringPred("ends-with?"),
    includes: stringPred("includes?"),
    matches: (v, re) => cmp("re-find?", [re, v]),
    in: (v, values) => cmp("in", [v, values]),
    call: (fn, ...args) => fnBind(fn, args),
    or: (...branches) => ({
        _tag: "or",
        branches,
        [Symbol.iterator]() {
            return yieldSelf(this);
        },
    }),
    not: (body) => ({
        _tag: "not",
        body,
        [Symbol.iterator]() {
            return yieldSelf(this);
        },
    }),
    pull: (focus, shape) => {
        if (!isVar(focus)) {
            throw new Error("ramose/query: Q.pull's first argument is the bound focus var");
        }
        return { _tag: "pullSpec", focus, shape: shape };
    },
    rows: (cells) => ({
        _tag: "rowsSpec",
        cells,
    }),
    value: (cell) => {
        if (!isAggSpec(cell) && !isVar(cell) && !isPullSpec(cell)) {
            throw new Error("ramose/query: Q.value(...) takes a bound var, Q.pull, or an aggregate cell");
        }
        return { _tag: "valueSpec", cell: cell };
    },
    distinct: (proj) => ({
        _tag: "distinctSpec",
        inner: distinctInner(proj),
    }),
    focus: FOCUS,
    row: (base, extra) => {
        if (isDistinctSpec(base)) {
            return Q.distinct(Q.row(base.inner, extra));
        }
        const cells = isRowsSpec(base)
            ? { ...base.cells, ...extra }
            : isPullSpec(base)
                ? { ...extra, ["…"]: base }
                : { ...base, ...extra };
        return { _tag: "rowsSpec", cells: cells };
    },
    count: (v) => agg("count", v),
    countDistinct: (v) => agg("count-distinct", v),
    sum: (v) => agg("sum", v),
    avg: (v) => agg("avg", v),
    min: (v) => agg("min", v),
    max: (v) => agg("max", v),
};
//# sourceMappingURL=kernel.js.map