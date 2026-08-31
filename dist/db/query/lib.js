import { isComposer } from "../Composer.js";
import { Q, } from "./kernel.js";
import { isPipeline } from "./query.js";
const addStage = (p, stage) => makePipeline(p.ns, [...p.stages, stage]);
const makePipeline = (ns, stages) => ({
    _tag: "Pipeline",
    ns,
    stages,
    [Symbol.iterator]() {
        let state = 0;
        const cmd = { _tag: "member", ns };
        return {
            next: (v) => state === 0
                ? ((state = 1), { done: false, value: cmd })
                : { done: true, value: v },
        };
    },
});
/**
 * The source stage: concrete entities of one type, or every concrete type
 * composing one trait. Membership is derived from the protected type fact
 * and current deployed composition through a catalog-generated rule.
 */
export const entities = (ns) => {
    if (!isComposer(ns)) {
        throw new Error("ramose/query: entities(...) takes an entity or trait");
    }
    return makePipeline(ns, []);
};
const filter = (frag) => ((x) => isPipeline(x) ? addStage(x, { kind: "frag", frag }) : frag(x));
const traversal = (frag) => ((x) => isPipeline(x) ? addStage(x, { kind: "frag", frag }) : frag(x));
/**
 * Lift a plain fragment into a pipeable stage — the same adapter every
 * shipped combinator uses, so a userland combinator is indistinguishable
 * from a shipped one. A fragment returning a handle refocuses the
 * pipeline; `void` keeps the focus.
 */
export const stage = ((frag) => ((x) => isPipeline(x) ? addStage(x, { kind: "frag", frag }) : frag(x)));
/** `is(A, v)`: `p(e) := [e A v]`. `is(N.id, v)` is the same filter as {@link byId}. */
export const is = (attr, value) => filter(function* (e) {
    yield* Q.fact(e, attr, value);
});
/**
 * `byId(id)`: the focus is this entity. The blessed spelling of a filter by
 * entity id — a serializable query stage, equivalent to `is(N.id, id)`. The
 * id is an entity identity, a local id, or an `{ id }` cell; lowering unifies
 * the focus with that id (`ground`), and never emits a `:db/id` pattern (that
 * is not an attribute).
 */
export const byId = (id) => filter(function* (e) {
    yield* Q.fact(e, { ident: ":db/id" }, id);
});
/** `has(A)`: the focus carries some `A` fact. */
export const has = (attr) => filter(function* (e) {
    yield* Q.fact(e, attr);
});
/** `missing(A)`: no `A` fact at all. */
export const missing = (attr) => filter(function* (e) {
    yield* Q.not(has(attr)(e));
});
export const matching = (attr, pred) => filter(function* (e) {
    const f = yield* Q.fact(e, attr);
    yield* pred(f.v);
});
const asFrag = (stage, e) => stage(e);
/**
 * Disjunction of filter stages — `any(startsWith(Issue.title, x), includes(Issue.body, x))`.
 * Built on {@link Q.or}; usable in fluent `.where(...)`. Each arm is
 * namespace-constrained the same way `is` / `matching` are.
 */
export const any = (...stages) => {
    if (stages.length === 0) {
        throw new Error("ramose/query: any(...) needs at least one stage");
    }
    return filter(function* (e) {
        yield* Q.or(...stages.map((s) => () => asFrag(s, e)));
    });
};
/**
 * Negation of a filter stage — `not(any(...))` is the negated disjunction.
 * Built on {@link Q.not}.
 */
export const not = (stage) => filter(function* (e) {
    yield* Q.not(() => asFrag(stage, e));
});
/** `gt(A, v)`: the attr's value is greater than `v`. */
export const gt = (attr, value) => matching(attr, (v) => Q.gt(v, value));
/** `gte(A, v)`: the attr's value is greater than or equal to `v`. */
export const gte = (attr, value) => matching(attr, (v) => Q.gte(v, value));
/** `lt(A, v)`: the attr's value is less than `v`. */
export const lt = (attr, value) => matching(attr, (v) => Q.lt(v, value));
/** `lte(A, v)`: the attr's value is less than or equal to `v`. */
export const lte = (attr, value) => matching(attr, (v) => Q.lte(v, value));
/** `startsWith(A, s)`: the string attr starts with `s`. */
export const startsWith = (attr, needle, opts) => matching(attr, (v) => Q.startsWith(v, needle, opts));
/** `includes(A, s)`: the string attr contains `s`. */
export const includes = (attr, needle, opts) => matching(attr, (v) => Q.includes(v, needle, opts));
/** `follow(A)`: `p(e) → other := [e A other]` — refocus on the target. */
export const follow = (attr) => traversal(function* (e) {
    return (yield* Q.fact(e, attr)).v;
});
/** `backlink(A)`: same clause, opposite mode — refocus on the referrer. */
export const backlink = (attr) => traversal(function* (other) {
    return (yield* Q.fact(Q._, attr, other)).e;
});
const reverseFilter = (frag) => ((x) => isPipeline(x) ? addStage(x, { kind: "frag", frag }) : frag(x));
/** `some(R, ps…)`: ∃ other. `[other R e]` ∧ ps(other). */
export const some = (ref, ...ps) => reverseFilter(function* (e) {
    const other = yield* backlink(ref)(e);
    for (const p of ps)
        yield* p(other);
});
/** `none(R, ps…)`: ¬∃ other. `[other R e]` ∧ ps(other). */
export const none = (ref, ...ps) => reverseFilter(function* (e) {
    yield* Q.not(function* () {
        const other = yield* backlink(ref)(e);
        for (const p of ps)
            yield* p(other);
    });
});
/** `every(R, ps…)`: ¬∃ other. `[other R e]` ∧ ¬ps(other) — vacuously true
 * of a focus nothing points at, like the nav surface's `every`. */
export const every = (ref, ...ps) => reverseFilter(function* (e) {
    yield* Q.not(function* () {
        const other = yield* backlink(ref)(e);
        yield* Q.not(function* () {
            for (const p of ps)
                yield* p(other);
        });
    });
});
/** Some fact about the focus was asserted at basis `t >= since`. */
export const updatedSince = (since) => filter(function* (e) {
    const f = yield* Q.fact(e);
    yield* Q.gte(f.t, since);
});
/** Some fact about the focus rides a transaction whose entity carries
 * `[tx A who]` — provenance as an ordinary clause. */
export const assertedBy = (attr, who) => filter(function* (e) {
    const f = yield* Q.fact(e);
    yield* Q.fact(f.tx, attr, who);
});
const assertPipeline = (x, what) => {
    if (!isPipeline(x)) {
        throw new Error(`ramose/query: ${what}(...) is a pipeline terminal — it closes a pipe, it is not a fragment`);
    }
    return x;
};
/** Contribute the projection — what a generator body says with its return.
 * A second argument adds aggregate cells beside the shape
 * (`.select({ name: User.name }, { n: Q.count(Q.focus) })`). */
export const select = ((shape, extra) => (q) => addStage(assertPipeline(q, "select"), {
    kind: "select",
    shape,
    extra,
}));
/** Contribute a sort key: a selected column's name, or an attr path. */
export const orderBy = (key, dir = "asc", opts) => (q) => addStage(assertPipeline(q, "orderBy"), {
    kind: "orderBy",
    key,
    dir,
    empty: opts?.empty ?? "last",
});
/** Keep at most `n` rows. */
export const limit = (n) => (q) => addStage(assertPipeline(q, "limit"), { kind: "limit", n });
/** Drop `n` rows from the front of the (ordered) result. */
export const offset = (n) => (q) => addStage(assertPipeline(q, "offset"), { kind: "offset", n });
/**
 * Project only the matched entity ids — today's cheap-subscription shape
 * (`{ id }` rows). The focus namespace is the pipeline's `N`, so a
 * `pipe(entities(User), ids())` row is `IdRow<User>` and a valid
 * {@link import("../idents.ts").EntityRef}.
 */
export const ids = () => (q) => addStage(assertPipeline(q, "ids"), { kind: "ids" });
//# sourceMappingURL=lib.js.map