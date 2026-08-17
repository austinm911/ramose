/**
 * Datalog query AST. The engine is AST-first: `parseQuery` turns EDN strings
 * or JS-form objects into this shape, and callers may build it directly.
 */

export interface Var {
  kind: "var";
  name: string; // includes leading '?'
}
export interface Const {
  kind: "const";
  value: unknown;
}
export interface Blank {
  kind: "blank";
}
export type Term = Var | Const | Blank;

export interface PatternClause {
  kind: "pattern";
  src?: string; // "$" or "$name"
  e: Term;
  a: Term;
  v: Term;
  tx?: Term;
  op?: Term;
}
export interface PredClause {
  kind: "pred";
  fn: string;
  args: Term[];
}
export interface FnClause {
  kind: "fn";
  fn: string;
  args: Term[];
  binding: Binding;
}
export interface NotClause {
  kind: "not";
  /** for not-join: explicit join vars */
  join?: string[];
  clauses: Clause[];
}
export interface OrClause {
  kind: "or";
  /** for or-join: explicit join vars */
  join?: string[];
  branches: Clause[][];
}
export type Clause = PatternClause | PredClause | FnClause | NotClause | OrClause;

export type Binding =
  | { kind: "scalar"; var: string }
  | { kind: "tuple"; vars: (string | null)[] }
  | { kind: "coll"; var: string }
  | { kind: "rel"; vars: (string | null)[] };

export interface AggregateElem {
  kind: "agg";
  fn: string;
  /** constant args come first, the variable last (Datomic style: (sum ?x), (max 3 ?x)) */
  args: Term[];
}
export interface PullElem {
  kind: "pull";
  var: string;
  pattern: PullPattern | Var;
}
export type FindElem = Var | AggregateElem | PullElem;

export type FindSpec =
  | { kind: "rel"; elems: FindElem[] }
  | { kind: "tuple"; elems: FindElem[] }
  | { kind: "coll"; elem: FindElem }
  | { kind: "scalar"; elem: FindElem };

export type InputSpec = { kind: "src"; name: string } | Binding;

/**
 * One sort key. Ordering is by a *bound variable* — a variable the :where
 * clauses bind, not necessarily one in :find — so multi-hop sorts lower to
 * ordinary joins (`[?e :todo/owner ?o] [?o :user/name ?n]`, order by `?n`).
 *
 * `empty` places rows whose value is null/undefined and defaults to "last"
 * in *both* directions; it is not flipped by `dir`.
 */
export interface OrderSpec {
  var: string;
  dir: "asc" | "desc";
  empty?: "first" | "last";
}

export interface Query {
  find: FindSpec;
  keys?: string[];
  with: string[];
  in: InputSpec[];
  where: Clause[];
  /** sort keys, applied before :offset/:limit and before pulls are resolved */
  order?: OrderSpec[];
  /** rows to drop from the front of the (ordered) result */
  offset?: number;
  /** maximum rows to return, after :offset */
  limit?: number;
}

// --- pull -------------------------------------------------------------------

export interface PullAttrSpec {
  kind: "attr";
  attr: string; // ident, e.g. ":user/name" (reverse: ":user/_friends")
  reverse: boolean;
  as?: string;
  limit?: number | null;
  default?: unknown;
  sub?: PullPattern;
  /** recursion depth for {:attr ...} with '...' or a number */
  recursion?: number | "...";
}
export interface PullWildcard {
  kind: "wildcard";
}
export type PullSpec = PullAttrSpec | PullWildcard;
export type PullPattern = PullSpec[];

export function isVar(t: Term): t is Var {
  return t.kind === "var";
}
export function v(name: string): Var {
  return { kind: "var", name };
}
export function c(value: unknown): Const {
  return { kind: "const", value };
}
export const blank: Blank = { kind: "blank" };
