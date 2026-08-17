/**
 * Query / pull-pattern parsing: EDN strings or JS forms → AST.
 *
 * JS form mirrors EDN structurally:
 *   { find: ["?e", ["count", "?x"]], in: ["$", "?name"], where: [["?e", ":user/name", "?name"], [[">", "?x", 5]]] }
 * Strings beginning with '?' are variables, '_' is blank, strings beginning
 * with ':' are keywords (attribute idents / enum values); wrap other strings
 * that happen to look like that in `{ const: "..." }`.
 */

import {
  type Binding,
  type Clause,
  type FindElem,
  type FindSpec,
  type InputSpec,
  type PullAttrSpec,
  type PullPattern,
  type Query,
  type Term,
  blank,
} from "./ast.ts";
import { EdnList, isEdnConstWrapper, printEdn, readEdn, unwrapEdnConst } from "./edn.ts";

export class QueryParseError extends Error {}

function fail(msg: string, form?: unknown): never {
  throw new QueryParseError(form === undefined ? msg : `${msg}: ${printEdn(form)}`);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function isVarName(x: unknown): x is string {
  return typeof x === "string" && x.length > 1 && x[0] === "?";
}
function isSrcName(x: unknown): x is string {
  return typeof x === "string" && x[0] === "$";
}
function isKeyword(x: unknown): x is string {
  return typeof x === "string" && x.length > 1 && x[0] === ":";
}
function isFnName(x: unknown): x is string {
  return typeof x === "string" && x.length > 0 && !isVarName(x) && !isKeyword(x) && !isSrcName(x) && x !== "_";
}

/** An expression form: EDN list, or a JS array whose head is a plain symbol. */
function asExpr(x: unknown): unknown[] | undefined {
  if (x instanceof EdnList) return x.items;
  if (Array.isArray(x) && x.length > 0 && isFnName(x[0])) return x;
  return undefined;
}

export function toTerm(x: unknown): Term {
  if (x === "_") return blank;
  if (isVarName(x)) return { kind: "var", name: x };
  if (isEdnConstWrapper(x)) return { kind: "const", value: unwrapEdnConst(x) };
  return { kind: "const", value: x };
}

function toBinding(x: unknown): Binding {
  if (isVarName(x)) return { kind: "scalar", var: x };
  if (Array.isArray(x)) {
    if (x.length === 2 && x[1] === "...") {
      if (!isVarName(x[0])) fail("collection binding needs a variable", x);
      return { kind: "coll", var: x[0] };
    }
    if (x.length === 1 && Array.isArray(x[0])) {
      return { kind: "rel", vars: x[0].map(bindVar) };
    }
    return { kind: "tuple", vars: x.map(bindVar) };
  }
  return fail("bad binding form", x);
}
function bindVar(x: unknown): string | null {
  if (x === "_") return null;
  if (isVarName(x)) return x;
  return fail("bad binding variable", x);
}

// ---------------------------------------------------------------------------
// where clauses
// ---------------------------------------------------------------------------

export function toClause(form: unknown): Clause {
  const expr = asExpr(form);
  if (expr) {
    // bare list at clause position: (not ...) (or ...) (or-join ...) (not-join ...) (and ...)
    return listClause(expr, form);
  }
  if (!Array.isArray(form)) fail("clause must be a vector or list", form);
  const arr = form as unknown[];
  if (arr.length === 0) fail("empty clause");
  const inner = asExpr(arr[0]);
  if (inner) {
    // [(pred ...)] or [(fn ...) binding]
    const head = inner[0];
    if (typeof head !== "string") fail("function/predicate name must be a symbol", form);
    if (head === "not" || head === "or" || head === "or-join" || head === "not-join" || head === "and") {
      return listClause(inner, form);
    }
    const args = inner.slice(1).map(toTerm);
    if (arr.length === 1) return { kind: "pred", fn: head, args };
    if (arr.length === 2) return { kind: "fn", fn: head, args, binding: toBinding(arr[1]) };
    return fail("bad function clause", form);
  }
  // data pattern: [src?] e a v tx? op?
  let i = 0;
  let src: string | undefined;
  if (isSrcName(arr[0])) {
    src = arr[0] as string;
    i = 1;
  }
  const rest = arr.slice(i);
  if (rest.length < 1 || rest.length > 5) fail("data pattern needs 1–5 components", form);
  const t = (k: number): Term => (k < rest.length ? toTerm(rest[k]) : blank);
  const clause: Clause = { kind: "pattern", src, e: t(0), a: t(1), v: t(2) };
  if (rest.length > 3) clause.tx = t(3);
  if (rest.length > 4) clause.op = t(4);
  return clause;
}

function listClause(items: unknown[], form: unknown): Clause {
  const head = items[0];
  switch (head) {
    case "not":
      return { kind: "not", clauses: items.slice(1).map(toClause) };
    case "not-join": {
      const join = items[1];
      if (!Array.isArray(join) || !join.every(isVarName)) fail("not-join needs a vector of variables", form);
      return { kind: "not", join: join as string[], clauses: items.slice(2).map(toClause) };
    }
    case "or":
      return { kind: "or", branches: items.slice(1).map(orBranch) };
    case "or-join": {
      const join = items[1];
      if (!Array.isArray(join)) fail("or-join needs a vector of variables", form);
      // Datomic allows [[?a ?b] ?c] required-var syntax; flatten
      const vars = (join as unknown[]).flatMap((x) => (Array.isArray(x) ? x : [x])) as string[];
      if (!vars.every(isVarName)) fail("or-join needs variables", form);
      return { kind: "or", join: vars, branches: items.slice(2).map(orBranch) };
    }
    case "and":
      return fail("(and ...) is only valid inside (or ...)", form);
    default:
      return fail(`unknown clause form '${String(head)}' (rules are not supported)`, form);
  }
}

function orBranch(form: unknown): Clause[] {
  const expr = asExpr(form);
  if (expr && expr[0] === "and") return expr.slice(1).map(toClause);
  return [toClause(form)];
}

// ---------------------------------------------------------------------------
// find / in
// ---------------------------------------------------------------------------

function toFindElem(x: unknown): FindElem {
  if (isVarName(x)) return { kind: "var", name: x };
  const expr = asExpr(x);
  if (expr) {
    const head = expr[0];
    if (head === "pull") {
      if (!isVarName(expr[1])) fail("pull needs a variable", x);
      const pat = expr[2];
      return { kind: "pull", var: expr[1], pattern: isVarName(pat) ? { kind: "var", name: pat } : parsePullPattern(pat) };
    }
    if (typeof head !== "string") fail("aggregate name must be a symbol", x);
    return { kind: "agg", fn: head, args: expr.slice(1).map(toTerm) };
  }
  return fail("bad find element", x);
}

function toFindSpec(form: unknown): FindSpec {
  if (!Array.isArray(form) || form.length === 0) fail("find spec must be a non-empty vector", form);
  const f = form as unknown[];
  if (f.length === 2 && f[1] === ".") return { kind: "scalar", elem: toFindElem(f[0]) };
  if (f.length === 1 && Array.isArray(f[0])) {
    const inner = f[0] as unknown[];
    if (asExpr(f[0]) === undefined) {
      if (inner.length === 2 && inner[1] === "...") return { kind: "coll", elem: toFindElem(inner[0]) };
      return { kind: "tuple", elems: inner.map(toFindElem) };
    }
  }
  return { kind: "rel", elems: f.map(toFindElem) };
}

function toInputs(form: unknown): InputSpec[] {
  if (form === undefined) return [{ kind: "src", name: "$" }];
  if (!Array.isArray(form)) fail("in spec must be a vector", form);
  return (form as unknown[]).map((x) => (isSrcName(x) ? { kind: "src", name: x } : toBinding(x)));
}

// ---------------------------------------------------------------------------
// query
// ---------------------------------------------------------------------------

function normalizeMap(form: unknown): Record<string, unknown> {
  if (typeof form === "string") form = readEdn(form);
  if (Array.isArray(form)) {
    // [:find ... :in ... :where ...]
    const out: Record<string, unknown> = {};
    let key: string | undefined;
    for (const x of form as unknown[]) {
      if (isKeyword(x) && [":find", ":in", ":where", ":with", ":keys", ":strs", ":syms"].includes(x)) {
        key = x.slice(1);
        out[key] = [];
        continue;
      }
      if (!key) fail("query vector must start with :find", form);
      (out[key] as unknown[]).push(x);
    }
    return out;
  }
  if (typeof form !== "object" || form === null) fail("query must be a map, vector, or EDN string", form);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(form as Record<string, unknown>)) out[k.startsWith(":") ? k.slice(1) : k] = v;
  return out;
}

export function parseQuery(form: unknown): Query {
  const m = normalizeMap(form);
  if (m.find === undefined) fail("query is missing :find");
  const find = toFindSpec(m.find);
  const where = m.where === undefined ? [] : (Array.isArray(m.where) ? m.where.map(toClause) : fail("where must be a vector", m.where));
  const inputs = toInputs(m.in);
  const withVars = m.with === undefined ? [] : (m.with as unknown[]).map((x) => (isVarName(x) ? x : fail("with needs variables", m.with)));
  const keysForm = m.keys ?? m.strs ?? m.syms;
  const keys = keysForm === undefined ? undefined : (keysForm as unknown[]).map(String);
  if (keys && find.kind !== "rel") fail(":keys requires a relation find spec");
  if (keys && find.kind === "rel" && keys.length !== find.elems.length) fail(":keys length must match :find");
  return { find, keys, with: withVars, in: inputs, where };
}

// ---------------------------------------------------------------------------
// pull patterns
// ---------------------------------------------------------------------------

export function parsePullPattern(form: unknown): PullPattern {
  if (typeof form === "string") form = readEdn(form);
  if (!Array.isArray(form)) fail("pull pattern must be a vector", form);
  return (form as unknown[]).map(pullSpec);
}

function attrName(x: unknown, form: unknown): { attr: string; reverse: boolean } {
  if (!isKeyword(x)) fail("pull attribute must be a keyword", form);
  const s = x as string;
  const slash = s.lastIndexOf("/");
  const name = slash >= 0 ? s.slice(slash + 1) : s.slice(1);
  if (name.startsWith("_")) {
    const attr = slash >= 0 ? s.slice(0, slash + 1) + name.slice(1) : ":" + name.slice(1);
    return { attr, reverse: true };
  }
  return { attr: s, reverse: false };
}

function pullSpec(x: unknown): PullAttrSpec | { kind: "wildcard" } {
  if (x === "*" || x === ":*") return { kind: "wildcard" };
  // Already-lowered AST specs (alchemy `lowerPullPattern`) pass through.
  if (
    typeof x === "object" &&
    x !== null &&
    !Array.isArray(x) &&
    (x as { kind?: unknown }).kind === "attr" &&
    typeof (x as { attr?: unknown }).attr === "string"
  ) {
    const spec = x as PullAttrSpec;
    if (spec.sub) spec.sub = parsePullPattern(spec.sub);
    return spec;
  }
  if (isKeyword(x)) return { kind: "attr", ...attrName(x, x) };
  const expr = asExpr(x);
  if (expr) {
    // (attr :as "x" :limit 5 :default 0)  or  (limit :attr 5) / (default :attr 0)
    const head = expr[0];
    if (head === "limit") return { kind: "attr", ...attrName(expr[1], x), limit: expr[2] as number | null };
    if (head === "default") return { kind: "attr", ...attrName(expr[1], x), default: expr[2] };
    const spec: PullAttrSpec = { kind: "attr", ...attrName(head, x) };
    for (let i = 1; i + 1 < expr.length; i += 2) {
      const k = expr[i], v = expr[i + 1];
      if (k === ":as") spec.as = String(v);
      else if (k === ":limit") spec.limit = v as number | null;
      else if (k === ":default") spec.default = v;
      else fail(`unknown pull option ${String(k)}`, x);
    }
    return spec;
  }
  if (typeof x === "object" && x !== null && !Array.isArray(x)) {
    const entries = Object.entries(x as Record<string, unknown>);
    if (entries.length !== 1) fail("pull map spec must have exactly one entry", x);
    const [k, sub] = entries[0];
    const spec: PullAttrSpec = { kind: "attr", ...attrName(k, x) };
    if (sub === "...") spec.recursion = "...";
    else if (typeof sub === "number") spec.recursion = sub;
    else spec.sub = parsePullPattern(sub);
    return spec;
  }
  return fail("bad pull spec", x);
}
