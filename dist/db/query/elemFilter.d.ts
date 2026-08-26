/**
 * Nested pull filters: kernel fragments, translated to the pull AST.
 *
 * The `where` entries of a cardinality-many collection's options record
 * (`.select(shape, { where: [ … ] })`, or `values(attr, { where: [ … ] })`
 * for a scalar) are the same filter fragments the pipe uses (`is`, `has`,
 * `Q.not`, a `matching(attr, pred)`, any userland combinator built from the
 * kernel). Each fragment runs against a
 * synthetic *element* var, and the recorded clauses — both sides inert data —
 * compile into the engine's per-element predicate tree ({@link PullElemPred}):
 * facts chain into paths (or `some` hops when an element carries several
 * constraints), `Q.not` maps to `not`, `Q.or` to `or`, and a comparison on
 * the element itself lowers with an empty path (which is how a card-many
 * scalar's values filter: the fragment is handed the value var directly).
 *
 * What cannot translate is rejected, never approximated: a pull-phase filter
 * runs per element after the row set is fixed, so it cannot correlate with
 * the enclosing query's vars, join two chains on a shared var, call an
 * engine rule, or read time positions.
 */
import type { PullElemPred } from "../../internal/core/query/ast.ts";
import { type AnyVar } from "./kernel.ts";
/** One `where` entry: a fragment over the element (an entity var for a
 * ref collection, the value var itself for a card-many scalar). */
export type ElemFilterFragment = (focus: AnyVar) => Iterable<unknown>;
/**
 * Lower `where` fragments into the pull AST's per-element predicates.
 * `attr` is the collection hop the filter attaches to: a ref (or backlink)
 * hands the fragments an element *entity* var; a card-many scalar hands
 * them the value var itself, so comparisons lower with an empty path.
 */
export declare const lowerElemFilter: (preds: readonly ElemFilterFragment[], attr: {
    readonly ident: string;
}) => PullElemPred[];
//# sourceMappingURL=elemFilter.d.ts.map