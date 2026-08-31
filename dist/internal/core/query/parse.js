import { PULL_ELEM_OPS, blank, } from "./ast.js";
import { EdnList, isEdnConstWrapper, printEdn, readEdn, unwrapEdnConst } from "./edn.js";
export class QueryParseError extends Error {
}
function fail(msg, form) {
    throw new QueryParseError(form === undefined ? msg : `${msg}: ${printEdn(form)}`);
}
function isVarName(x) {
    return typeof x === "string" && x.length > 1 && x[0] === "?";
}
function isSrcName(x) {
    return typeof x === "string" && x[0] === "$";
}
function isKeyword(x) {
    return typeof x === "string" && x.length > 1 && x[0] === ":";
}
function isFnName(x) {
    return typeof x === "string" && x.length > 0 && !isVarName(x) && !isKeyword(x) && !isSrcName(x) && x !== "_";
}
function asExpr(x) {
    if (x instanceof EdnList)
        return x.items;
    if (Array.isArray(x) && x.length > 0 && isFnName(x[0]))
        return x;
    return undefined;
}
export function toTerm(x) {
    if (x === "_")
        return blank;
    if (isVarName(x))
        return { kind: "var", name: x };
    if (isEdnConstWrapper(x))
        return { kind: "const", value: unwrapEdnConst(x) };
    return { kind: "const", value: x };
}
function toBinding(x) {
    if (isVarName(x))
        return { kind: "scalar", var: x };
    if (Array.isArray(x)) {
        if (x.length === 2 && x[1] === "...") {
            if (!isVarName(x[0]))
                fail("collection binding needs a variable", x);
            return { kind: "coll", var: x[0] };
        }
        if (x.length === 1 && Array.isArray(x[0])) {
            return { kind: "rel", vars: x[0].map(bindVar) };
        }
        return { kind: "tuple", vars: x.map(bindVar) };
    }
    return fail("bad binding form", x);
}
function bindVar(x) {
    if (x === "_")
        return null;
    if (isVarName(x))
        return x;
    return fail("bad binding variable", x);
}
export function toClause(form) {
    const expr = asExpr(form);
    if (expr) {
        return listClause(expr, form);
    }
    if (!Array.isArray(form))
        fail("clause must be a vector or list", form);
    const arr = form;
    if (arr.length === 0)
        fail("empty clause");
    const inner = asExpr(arr[0]);
    if (inner) {
        const head = inner[0];
        if (typeof head !== "string")
            fail("function/predicate name must be a symbol", form);
        if (head === "not" || head === "or" || head === "or-join" || head === "not-join" || head === "and") {
            return listClause(inner, form);
        }
        const args = inner.slice(1).map(toTerm);
        if (arr.length === 1)
            return { kind: "pred", fn: head, args };
        if (arr.length === 2)
            return { kind: "fn", fn: head, args, binding: toBinding(arr[1]) };
        return fail("bad function clause", form);
    }
    let i = 0;
    let src;
    if (isSrcName(arr[0])) {
        src = arr[0];
        i = 1;
    }
    const rest = arr.slice(i);
    if (rest.length < 1 || rest.length > 5)
        fail("data pattern needs 1–5 components", form);
    const t = (k) => (k < rest.length ? toTerm(rest[k]) : blank);
    const clause = { kind: "pattern", ...(src !== undefined ? { src } : {}), e: t(0), a: t(1), v: t(2) };
    if (rest.length > 3)
        clause.tx = t(3);
    if (rest.length > 4)
        clause.op = t(4);
    return clause;
}
function listClause(items, form) {
    const head = items[0];
    switch (head) {
        case "not":
            return { kind: "not", clauses: items.slice(1).map(toClause) };
        case "not-join": {
            const join = items[1];
            if (!Array.isArray(join) || !join.every(isVarName))
                fail("not-join needs a vector of variables", form);
            return { kind: "not", join: join, clauses: items.slice(2).map(toClause) };
        }
        case "or":
            return { kind: "or", branches: items.slice(1).map(orBranch) };
        case "or-join": {
            const join = items[1];
            if (!Array.isArray(join))
                fail("or-join needs a vector of variables", form);
            const vars = join.flatMap((x) => (Array.isArray(x) ? x : [x]));
            if (!vars.every(isVarName))
                fail("or-join needs variables", form);
            return { kind: "or", join: vars, branches: items.slice(2).map(orBranch) };
        }
        case "and":
            return fail("(and ...) is only valid inside (or ...)", form);
        default: {
            if (!isFnName(head))
                return fail(`bad clause head '${String(head)}'`, form);
            return { kind: "rule-call", name: head, args: items.slice(1).map(toTerm) };
        }
    }
}
function orBranch(form) {
    const expr = asExpr(form);
    if (expr && expr[0] === "and")
        return expr.slice(1).map(toClause);
    return [toClause(form)];
}
function toFindElem(x) {
    if (isVarName(x))
        return { kind: "var", name: x };
    const expr = asExpr(x);
    if (expr) {
        const head = expr[0];
        if (head === "pull") {
            if (!isVarName(expr[1]))
                fail("pull needs a variable", x);
            const pat = expr[2];
            return { kind: "pull", var: expr[1], pattern: isVarName(pat) ? { kind: "var", name: pat } : parsePullPattern(pat) };
        }
        if (head === "as") {
            if (expr.length !== 3)
                fail("as is (as <aggregate> ?var)", x);
            const inner = toFindElem(expr[1]);
            if (inner.kind !== "agg")
                fail("as names an aggregate find element", x);
            if (inner.as !== undefined)
                fail("as does not nest", x);
            if (!isVarName(expr[2]))
                fail("as needs a variable", x);
            return { ...inner, as: expr[2] };
        }
        if (typeof head !== "string")
            fail("aggregate name must be a symbol", x);
        return { kind: "agg", fn: head, args: expr.slice(1).map(toTerm) };
    }
    return fail("bad find element", x);
}
function toFindSpec(form) {
    if (!Array.isArray(form) || form.length === 0)
        fail("find spec must be a non-empty vector", form);
    const f = form;
    if (f.length === 2 && f[1] === ".")
        return { kind: "scalar", elem: toFindElem(f[0]) };
    if (f.length === 1 && Array.isArray(f[0])) {
        const inner = f[0];
        if (asExpr(f[0]) === undefined) {
            if (inner.length === 2 && inner[1] === "...")
                return { kind: "coll", elem: toFindElem(inner[0]) };
            return { kind: "tuple", elems: inner.map(toFindElem) };
        }
    }
    return { kind: "rel", elems: f.map(toFindElem) };
}
function toInputs(form) {
    if (form === undefined)
        return [{ kind: "src", name: "$" }];
    if (!Array.isArray(form))
        fail("in spec must be a vector", form);
    return form.map((x) => (isSrcName(x) ? { kind: "src", name: x } : toBinding(x)));
}
function bare(x) {
    return typeof x === "string" && x.startsWith(":") ? x.slice(1) : x;
}
function orderDir(x, form) {
    if (x === undefined)
        return "asc";
    const s = bare(x);
    if (s === "asc" || s === "desc")
        return s;
    return fail("order direction must be :asc or :desc", form);
}
function orderEmpty(x, form) {
    if (x === undefined)
        return undefined;
    const s = bare(x);
    if (s === "first" || s === "last")
        return s;
    return fail("order empty placement must be :first or :last", form);
}
function mkOrder(name, dir, empty) {
    return empty === undefined ? { var: name, dir } : { var: name, dir, empty };
}
function toOrderSpec(x) {
    if (isVarName(x))
        return { var: x, dir: "asc" };
    if (Array.isArray(x)) {
        if (!isVarName(x[0]))
            fail("order needs a variable", x);
        if (x.length > 3)
            fail("order tuple is [?var dir? empty?]", x);
        return mkOrder(x[0], orderDir(x[1], x), orderEmpty(x[2], x));
    }
    if (typeof x === "object" && x !== null && !(x instanceof EdnList)) {
        const m = {};
        for (const [k, v] of Object.entries(x))
            m[String(bare(k))] = v;
        for (const k of Object.keys(m))
            if (k !== "var" && k !== "dir" && k !== "empty")
                fail(`unknown order key :${k}`, x);
        if (!isVarName(m.var))
            fail("order needs a variable", x);
        return mkOrder(m.var, orderDir(m.dir, x), orderEmpty(m.empty, x));
    }
    return fail("bad order spec", x);
}
function toOrder(form) {
    if (form === undefined)
        return undefined;
    if (!Array.isArray(form))
        fail("order must be a vector", form);
    const specs = form.map(toOrderSpec);
    return specs.length ? specs : undefined;
}
function toCount(x, key) {
    if (x === undefined || x === null)
        return undefined;
    if (typeof x !== "number" || !Number.isInteger(x) || x < 0)
        fail(`:${key} must be a non-negative integer`, x);
    return x;
}
function toAfter(form, order, find) {
    if (form === undefined || form === null)
        return undefined;
    if (!Array.isArray(form))
        fail(":after must be a vector of values, one per :order key", form);
    if (order === undefined)
        fail(":after needs :order — a cursor is a position in the sort", form);
    if (form.length !== order.length) {
        fail(`:after has ${form.length} values for ${order.length} :order keys`, form);
    }
    const elems = find.kind === "rel" || find.kind === "tuple" ? find.elems : [find.elem];
    if (elems.some((e) => e.kind === "agg"))
        fail(":after is not supported with aggregates", form);
    return form.map((x) => (isEdnConstWrapper(x) ? unwrapEdnConst(x) : x));
}
const SECTIONS = [":find", ":in", ":where", ":with", ":keys", ":strs", ":syms", ":rules", ":having", ":order", ":after", ":limit", ":offset"];
const SCALAR_SECTIONS = ["after", "limit", "offset", "rules"];
const QUERY_KEYS = new Set(SECTIONS.map((s) => s.slice(1)));
function normalizeMap(form) {
    if (typeof form === "string")
        form = readEdn(form);
    if (Array.isArray(form)) {
        const out = {};
        let key;
        for (const x of form) {
            if (isKeyword(x) && SECTIONS.includes(x)) {
                key = x.slice(1);
                out[key] = [];
                continue;
            }
            if (!key)
                fail("query vector must start with :find", form);
            out[key].push(x);
        }
        for (const k of SCALAR_SECTIONS) {
            const vs = out[k];
            if (vs === undefined)
                continue;
            if (vs.length !== 1)
                fail(`:${k} takes exactly one value`, form);
            out[k] = vs[0];
        }
        return out;
    }
    if (typeof form !== "object" || form === null)
        fail("query must be a map, vector, or EDN string", form);
    const out = {};
    for (const [k, v] of Object.entries(form))
        out[k.startsWith(":") ? k.slice(1) : k] = v;
    return out;
}
export function parseQuery(form) {
    const m = normalizeMap(form);
    for (const k of Object.keys(m)) {
        if (!QUERY_KEYS.has(k))
            fail(`unknown query key :${k} (expected one of ${SECTIONS.join(" ")})`);
    }
    if (m.find === undefined)
        fail("query is missing :find");
    const find = toFindSpec(m.find);
    const where = m.where === undefined ? [] : (Array.isArray(m.where) ? m.where.map(toClause) : fail("where must be a vector", m.where));
    const inputs = toInputs(m.in);
    const withVars = m.with === undefined ? [] : m.with.map((x) => (isVarName(x) ? x : fail("with needs variables", m.with)));
    const keysForm = m.keys ?? m.strs ?? m.syms;
    const keys = keysForm === undefined ? undefined : keysForm.map(String);
    if (keys && find.kind !== "rel")
        fail(":keys requires a relation find spec");
    if (keys && find.kind === "rel" && keys.length !== find.elems.length)
        fail(":keys length must match :find");
    const rules = toRules(m.rules);
    checkRuleCalls(where, rules);
    const having = toHaving(m.having, find);
    const order = toOrder(m.order);
    const after = toAfter(m.after, order, find);
    const limit = toCount(m.limit, "limit");
    const offset = toCount(m.offset, "offset");
    return {
        find,
        ...(keys !== undefined ? { keys } : {}),
        with: withVars,
        in: inputs,
        where,
        ...(rules !== undefined ? { rules } : {}),
        ...(having !== undefined ? { having } : {}),
        ...(order !== undefined ? { order } : {}),
        ...(after !== undefined ? { after } : {}),
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
    };
}
function toRules(form) {
    if (form === undefined)
        return undefined;
    if (!Array.isArray(form))
        fail(":rules must be a vector of rule definitions", form);
    const defs = form.map(toRuleDef);
    if (defs.length === 0)
        return undefined;
    const arity = new Map();
    for (const d of defs) {
        const seen = arity.get(d.name);
        if (seen !== undefined && seen !== d.args.length) {
            fail(`rule ${d.name} is defined with ${seen} and ${d.args.length} head variables — branches of one rule share a head`);
        }
        arity.set(d.name, d.args.length);
    }
    for (const d of defs)
        checkRuleCalls(d.clauses, defs);
    return defs;
}
function toRuleDef(form) {
    const items = form instanceof EdnList ? form.items : Array.isArray(form) ? form : fail("rule definition must be [[name ?arg…] clause…]", form);
    if (items.length < 2)
        fail("rule definition needs a head and at least one clause", form);
    const head = items[0] instanceof EdnList ? items[0].items : Array.isArray(items[0]) ? items[0] : fail("rule head must be [name ?arg…]", form);
    const name = head[0];
    if (!isFnName(name))
        fail("rule name must be a plain symbol", form);
    const args = head.slice(1);
    if (args.length === 0)
        fail(`rule ${String(name)} needs at least one head variable`, form);
    if (!args.every(isVarName))
        fail(`rule ${String(name)} head takes variables only`, form);
    if (new Set(args).size !== args.length)
        fail(`rule ${String(name)} repeats a head variable`, form);
    return { name: name, args: args, clauses: items.slice(1).map(toClause) };
}
function checkRuleCalls(clauses, rules) {
    const arity = new Map();
    for (const d of rules ?? [])
        arity.set(d.name, d.args.length);
    const walk = (c) => {
        switch (c.kind) {
            case "rule-call": {
                const n = arity.get(c.name);
                if (n === undefined) {
                    fail(`unknown clause form '${c.name}' — not a builtin and not a rule declared in :rules`);
                }
                if (c.args.length !== n)
                    fail(`rule ${c.name} takes ${n} arguments, got ${c.args.length}`);
                break;
            }
            case "not":
                c.clauses.forEach(walk);
                break;
            case "or":
                c.branches.forEach((b) => b.forEach(walk));
                break;
            default:
                break;
        }
    };
    clauses.forEach(walk);
}
function toHaving(form, find) {
    if (form === undefined)
        return undefined;
    if (!Array.isArray(form))
        fail("having must be a vector", form);
    const clauses = form.map(toClause);
    if (clauses.length === 0)
        return undefined;
    const elems = find.kind === "rel" || find.kind === "tuple" ? find.elems : [find.elem];
    if (!elems.some((e) => e.kind === "agg")) {
        fail(":having needs aggregates — it filters groups after they are computed", form);
    }
    const walk = (c) => {
        switch (c.kind) {
            case "pattern":
                fail(":having filters grouped cells, not datoms — put row filters in :where", form);
                break;
            case "fn":
                fail(":having does not bind functions — compare the group cells", form);
                break;
            case "pred":
                break;
            case "not":
                c.clauses.forEach(walk);
                break;
            case "or":
                c.branches.forEach((b) => b.forEach(walk));
                break;
        }
    };
    clauses.forEach(walk);
    return clauses;
}
export function parsePullPattern(form) {
    if (typeof form === "string")
        form = readEdn(form);
    if (!Array.isArray(form))
        fail("pull pattern must be a vector", form);
    return form.map(pullSpec);
}
function attrName(x, form) {
    if (!isKeyword(x))
        fail("pull attribute must be a keyword", form);
    const s = x;
    const slash = s.lastIndexOf("/");
    const name = slash >= 0 ? s.slice(slash + 1) : s.slice(1);
    if (name.startsWith("_")) {
        const attr = slash >= 0 ? s.slice(0, slash + 1) + name.slice(1) : ":" + name.slice(1);
        return { attr, reverse: true };
    }
    return { attr: s, reverse: false };
}
function keyedMap(x, what, form) {
    if (typeof x !== "object" || x === null || Array.isArray(x) || x instanceof EdnList)
        fail(`${what} must be a map`, form);
    const m = {};
    for (const [k, v] of Object.entries(x))
        m[String(bare(k))] = v;
    return m;
}
function elemPath(pathForm, revForm, form) {
    if (!Array.isArray(pathForm))
        fail("pull path must be a vector of attribute idents", form);
    if (revForm !== undefined && !Array.isArray(revForm))
        fail("pull path :reverse must be a vector of booleans", form);
    const revIn = revForm ?? [];
    const path = [];
    const reverse = [];
    pathForm.forEach((p, i) => {
        if (!isKeyword(p))
            fail("pull path must be a vector of attribute idents", form);
        const { attr, reverse: rev } = p === ":db/id" ? { attr: ":db/id", reverse: false } : attrName(p, form);
        path.push(attr);
        reverse.push(rev || revIn[i] === true);
    });
    return reverse.some(Boolean) ? { path, reverse } : { path };
}
function elemValue(x) {
    return isEdnConstWrapper(x) ? unwrapEdnConst(x) : x;
}
function elemPreds(x, form) {
    if (!Array.isArray(x))
        fail("pull :where must be a vector of predicates", form);
    return x.map((p) => elemPred(p, form));
}
function elemQuant(x, what, form) {
    const m = keyedMap(x, `pull :where ${what}`, form);
    if (m.pred === undefined)
        fail(`pull :where ${what} needs a :pred`, form);
    return { ...elemPath(m.path ?? [], m.reverse, form), pred: elemPred(m.pred, form) };
}
function elemPred(x, form) {
    const m = keyedMap(x, "pull :where predicate", form);
    if (m.and !== undefined)
        return { and: elemPreds(m.and, form) };
    if (m.or !== undefined)
        return { or: elemPreds(m.or, form) };
    if (m.not !== undefined)
        return { not: elemPred(m.not, form) };
    if (m.every !== undefined)
        return { every: elemQuant(m.every, "every", form) };
    if (m.some !== undefined)
        return { some: elemQuant(m.some, "some", form) };
    const op = bare(m.op);
    if (typeof op !== "string" || !PULL_ELEM_OPS.includes(op)) {
        fail(`unknown pull :where op ${String(m.op)} (expected one of ${PULL_ELEM_OPS.join(" ")})`, form);
    }
    const out = { ...elemPath(m.path ?? [], m.reverse, form), op: op };
    if (op === "in") {
        if (!Array.isArray(m.value))
            fail("pull :where in takes a vector of values", form);
        out.value = m.value.map(elemValue);
    }
    else if (op !== "exists" && op !== "missing") {
        out.value = elemValue(m.value);
    }
    return out;
}
function elemOrders(x, form) {
    if (!Array.isArray(x))
        fail("pull :order must be a vector of sort keys", form);
    return x.map((o) => {
        const m = keyedMap(o, "pull :order key", form);
        const empty = orderEmpty(m.empty, form);
        const key = { ...elemPath(m.path ?? [], m.reverse, form), dir: orderDir(m.dir, form) };
        if (empty !== undefined)
            key.empty = empty;
        return key;
    });
}
function pullSpec(x) {
    if (x === "*" || x === ":*")
        return { kind: "wildcard" };
    if (typeof x === "object" &&
        x !== null &&
        !Array.isArray(x) &&
        x.kind === "attr" &&
        typeof x.attr === "string") {
        const spec = x;
        const out = { ...spec };
        if (spec.sub !== undefined)
            out.sub = parsePullPattern(spec.sub);
        if (spec.where !== undefined)
            out.where = elemPreds(spec.where, x);
        if (spec.order !== undefined)
            out.order = elemOrders(spec.order, x);
        if (spec.offset !== undefined) {
            const offset = toCount(spec.offset, "offset");
            if (offset !== undefined)
                out.offset = offset;
        }
        return out;
    }
    if (isKeyword(x))
        return { kind: "attr", ...attrName(x, x) };
    const expr = asExpr(x);
    if (expr) {
        const head = expr[0];
        if (head === "limit")
            return { kind: "attr", ...attrName(expr[1], x), limit: expr[2] };
        if (head === "default")
            return { kind: "attr", ...attrName(expr[1], x), default: expr[2] };
        const spec = { kind: "attr", ...attrName(head, x) };
        for (let i = 1; i + 1 < expr.length; i += 2) {
            const k = expr[i], v = expr[i + 1];
            if (k === ":as")
                spec.as = String(v);
            else if (k === ":limit")
                spec.limit = v;
            else if (k === ":offset") {
                const offset = toCount(v, "offset");
                if (offset !== undefined)
                    spec.offset = offset;
            }
            else if (k === ":where")
                spec.where = elemPreds(v, x);
            else if (k === ":order")
                spec.order = elemOrders(v, x);
            else if (k === ":default")
                spec.default = v;
            else
                fail(`unknown pull option ${String(k)}`, x);
        }
        return spec;
    }
    if (typeof x === "object" && x !== null && !Array.isArray(x)) {
        const entries = Object.entries(x);
        if (entries.length !== 1)
            fail("pull map spec must have exactly one entry", x);
        const [k, sub] = entries[0];
        const spec = { kind: "attr", ...attrName(k, x) };
        if (sub === "...")
            spec.recursion = "...";
        else if (typeof sub === "number")
            spec.recursion = sub;
        else
            spec.sub = parsePullPattern(sub);
        return spec;
    }
    return fail("bad pull spec", x);
}
//# sourceMappingURL=parse.js.map