import { refTargetNs } from "../Pull.js";
import { isMutationRef } from "../refs.js";
import { collectBody, isBlank, isVar, mkVar, } from "./kernel.js";
const err = (msg) => {
    throw new Error(`ramose/query: ${msg}`);
};
const OPS = {
    "=": "=",
    "not=": "!=",
    "<": "<",
    "<=": "<=",
    ">": ">",
    ">=": ">=",
    "starts-with?": "starts-with?",
    "ends-with?": "ends-with?",
    "includes?": "includes?",
    in: "in",
};
const FLIPPED = {
    "=": "=",
    "not=": "!=",
    "<": ">",
    "<=": ">=",
    ">": "<",
    ">=": "<=",
};
const unwrapEidLike = (v) => typeof v === "object" &&
    v !== null &&
    typeof v.id === "number" &&
    Object.keys(v).length === 1
    ? v.id
    : v;
const regexSource = (re) => {
    if (typeof re === "string")
        return re;
    if (re.flags !== "") {
        err(`matches(/${re.source}/${re.flags}) — the peer compiles the pattern with no flags; express it in the pattern instead`);
    }
    return re.source;
};
const lowerValue = (v) => {
    const named = typeof v === "object" && v !== null
        ? v.id
        : v;
    if (isMutationRef(named)) {
        err("a pull-phase filter is compiled into the query value itself, before any replica binding exists, so it cannot resolve an entity identity — constrain the entity in the query's own where()");
    }
    return unwrapEidLike(v);
};
const isCmpPred = (p) => typeof p.op === "string" && Array.isArray(p.path);
const andOf = (preds) => preds.length === 1 ? preds[0] : { and: [...preds] };
const isRefAttr = (attr) => typeof attr === "object" &&
    attr !== null &&
    attr.valueType === "ref";
const collectVarIds = (list, into) => {
    for (const c of list) {
        switch (c._tag) {
            case "fact": {
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
                break;
            }
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
                c.branches.forEach((b) => collectVarIds(b, into));
                break;
            case "notGroup":
                collectVarIds(c.clauses, into);
                break;
        }
    }
};
const mentions = (c, v) => {
    const one = new Set();
    collectVarIds([c], one);
    return one.has(v.id);
};
export const lowerElemFilter = (preds, attr) => {
    const elem = isRefAttr(attr)
        ? mkVar("entity", refTargetNs(attr))
        : mkVar("value");
    const clauses = [];
    for (const p of preds) {
        if (typeof p !== "function") {
            err(`the where filter on ${attr.ident} takes filter fragments — is(...), has(...), a (v) => comparison, or any fragment built from the kernel`);
        }
        clauses.push(...collectBody(p(elem)));
    }
    const seen = new Set();
    collectVarIds(clauses, seen);
    for (const id of seen) {
        if (id < elem.id) {
            err(`the where filter on ${attr.ident} closes over a var from the enclosing query — a pull-phase filter runs per element after the rows are fixed, so it cannot correlate with the outer query; constrain the rows in the query itself, or compare against a literal or param`);
        }
    }
    const used = new Set();
    const bound = new Set([elem.id]);
    const predsOn = (v, list) => {
        const out = [];
        for (const c of list) {
            if (used.has(c) || !mentions(c, v))
                continue;
            used.add(c);
            out.push(oneClause(c, v, list));
        }
        return out;
    };
    const predsOfList = (list, v) => {
        const out = predsOn(v, list);
        const leftover = list.find((c) => !used.has(c));
        if (leftover !== undefined)
            rejectClause(leftover);
        return out;
    };
    const rejectClause = (c) => {
        switch (c._tag) {
            case "memberOf":
                return err(`entities(...) does not lower to a pull filter on ${attr.ident} — the collection already scopes its elements; constrain them with clauses on the element`);
            case "ruleCall":
                return err(`a named rule does not lower to a pull filter on ${attr.ident} — the pull phase has no rule engine; inline the fragment instead`);
            case "fnBind":
                return err(`Q.call does not lower to a pull filter on ${attr.ident} — the pull phase has no function bindings; constrain the rows in the query itself`);
            default:
                return err(`a clause in the where filter on ${attr.ident} neither constrains the element nor chains from it — a pull-phase filter walks paths from each element; it cannot join two chains on a shared var or correlate with other clauses`);
        }
    };
    const hopPred = (ident, reverse, target, list) => {
        if (bound.has(target.id)) {
            err(`the where filter on ${attr.ident} reaches one var by two facts — a pull-phase filter walks a tree of paths and cannot join them; chain from a single binding instead`);
        }
        bound.add(target.id);
        const inner = predsOn(target, list);
        if (inner.length === 0) {
            return exists(ident, reverse);
        }
        if (inner.length === 1 && isCmpPred(inner[0])) {
            const p = inner[0];
            const revs = [reverse, ...(p.reverse ?? p.path.map(() => false))];
            return {
                path: [ident, ...p.path],
                ...(revs.some(Boolean) ? { reverse: revs } : {}),
                op: p.op,
                ...("value" in p ? { value: p.value } : {}),
            };
        }
        return {
            some: {
                path: [ident],
                ...(reverse ? { reverse: [true] } : {}),
                pred: andOf(inner),
            },
        };
    };
    const exists = (ident, reverse) => ({
        path: [ident],
        ...(reverse ? { reverse: [true] } : {}),
        op: "exists",
    });
    const factPred = (c, v, list) => {
        if (c.attr === undefined) {
            err(`the where filter on ${attr.ident} uses an attribute-free fact — a pull filter walks named attributes from each element`);
        }
        if (c.txVar !== undefined || c.opVar !== undefined) {
            err(`the where filter on ${attr.ident} reads a time position (f.t / f.tx / f.op) — the pull phase reads the present; ask time questions in the query itself`);
        }
        const ident = c.attr.ident;
        const e = c.eVar ?? c.e0;
        const val = c.vVar ?? c.v0;
        if (isVar(e) && e.id === v.id) {
            if (isVar(val))
                return hopPred(ident, false, val, list);
            if (val === undefined || isBlank(val))
                return exists(ident, false);
            return { path: [ident], op: "=", value: lowerValue(val) };
        }
        if (isVar(val) && val.id === v.id) {
            if (!isRefAttr(c.attr)) {
                err(`the where filter on ${attr.ident} walks ${ident} backwards — only a reference can be read from its target`);
            }
            if (isVar(e))
                return hopPred(ident, true, e, list);
            if (e === undefined || isBlank(e))
                return exists(ident, true);
            return {
                path: [ident, ":db/id"],
                reverse: [true, false],
                op: "=",
                value: lowerValue(e),
            };
        }
        return err(`the where filter on ${attr.ident}: a fact mentions the element only through a position the pull phase cannot walk`);
    };
    const cmpPred = (op, args, v, ignoreCase) => {
        if (ignoreCase) {
            err(`the where filter on ${attr.ident}: ignoreCase does not lower to a pull filter — constrain the rows in the query itself, or compare against a lowercased literal`);
        }
        const other = args.find((a) => !(isVar(a) && a.id === v.id));
        if (isVar(other)) {
            err(`the where filter on ${attr.ident} compares two bound values — a pull-phase filter compares each reached value against a constant`);
        }
        if (op === "re-find?") {
            const [pattern, subject] = args;
            if (!(isVar(subject) && subject.id === v.id)) {
                err(`the where filter on ${attr.ident}: matches(...) must test the element's value — the pattern cannot be the bound side`);
            }
            return {
                path: [],
                op: "re-find?",
                value: regexSource(pattern),
            };
        }
        const first = args[0];
        const subjectFirst = isVar(first) && first.id === v.id;
        if (op === "in") {
            if (!subjectFirst) {
                err(`the where filter on ${attr.ident}: Q.in's first argument is the element's value`);
            }
            const values = args[1];
            return {
                path: [],
                op: "in",
                value: Array.isArray(values)
                    ? values.map(lowerValue)
                    : err(`Q.in takes an array of values, got ${String(values)}`),
            };
        }
        const mapped = subjectFirst ? OPS[op] : FLIPPED[op];
        if (mapped === undefined) {
            err(subjectFirst
                ? `the where filter on ${attr.ident}: the comparison "${op}" does not lower to a pull filter`
                : `the where filter on ${attr.ident}: "${op}" must test the element's value — write the element as the first operand`);
        }
        return { path: [], op: mapped, value: lowerValue(other) };
    };
    const oneClause = (c, v, list) => {
        switch (c._tag) {
            case "fact":
                return factPred(c, v, list);
            case "cmp":
                return cmpPred(c.op, c.args, v, c.ignoreCase);
            case "orGroup":
                return { or: c.branches.map((b) => andOf(predsOfList(b, v))) };
            case "notGroup":
                return { not: andOf(predsOfList(c.clauses, v)) };
            case "memberOf":
            case "ruleCall":
            case "fnBind":
                return rejectClause(c);
        }
    };
    return predsOfList(clauses, elem);
};
//# sourceMappingURL=elemFilter.js.map