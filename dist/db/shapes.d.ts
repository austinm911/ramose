import type { AnyField, Cardinality } from "./Field.ts";
import type { AnyEntity } from "./Entity.ts";
import type { AnyComposer } from "./Composer.ts";
import type { AttrIdent, FocusIdents } from "./query/focus.ts";
import type { EidCell, Var } from "./query/kernel.ts";
import { type Again, type AgainAsField, type AgainMissingId, type AgainNsMismatch, type AgainTargetNs, type AllRow, type AllShape, type HasIdField, type IdCell, type IsAgainSelectField, type IsAgainTerm, type PullDefault, type PullNestedConstraints, type RecurDepth, type ShapeNs, type Unroll, optional } from "./Pull.ts";
export type PathCarrier = {
    readonly ident: string;
    readonly cardinality?: Cardinality | undefined;
    readonly __path?: readonly string[];
    readonly __cards?: readonly Cardinality[];
    readonly __revs?: readonly boolean[];
    readonly __reverse?: boolean;
};
export declare const pathOf: (attr: PathCarrier) => readonly string[];
export declare const cardsOf: (attr: PathCarrier) => readonly Cardinality[];
export declare const revsOf: (attr: PathCarrier) => readonly boolean[];
export type AttrValue<A> = A extends {
    readonly schema: {
        readonly Type: infer T;
    };
} ? T : unknown;
/** What names an entity in a value position: a raw eid, or an `Eid` row cell. */
export type EidLike = number | {
    readonly id: number;
};
type IsMany<A> = A extends {
    readonly cardinality: "many";
} ? true : false;
type IsDefaultable<A> = IsMany<A> extends true ? false : A extends {
    readonly valueType: "ref";
} ? false : true;
type RefSelect<A> = {
    <const D extends RecurDepth>(shape: Again<D>, opts?: SelectOpts<A>): SelectNested<A, Again<D>>;
    <const N extends AnyEntity>(shape: AllShape<N>, opts?: SelectOpts<A>): SelectNested<A, AllShape<N>>;
    <const S extends Shape>(shape: S & ValidShape<S>, opts?: SelectOpts<A>): SelectNested<A, S>;
};
type SelectOpts<A> = [IsManyRef<A>] extends [true] ? NestedOpts<A> : never;
export type OrderEmpty = "first" | "last";
export type OrderDir = "asc" | "desc";
export type ShapeField = AnyField | PathCarrier | Again | {
    readonly _tag: "optional";
    readonly field: unknown;
} | {
    readonly _tag: "default";
    readonly field: unknown;
    readonly value: unknown;
} | {
    readonly _tag: "nested";
    readonly attr: unknown;
    readonly pattern: unknown;
} | {
    readonly _tag: "select";
    readonly attr: unknown;
    readonly shape: Shape | AllShape | Again;
} | {
    readonly _tag: "collection";
    readonly attr: unknown;
};
export type Shape = {
    readonly [key: string]: ShapeField;
};
export type ValidShape<S> = {
    readonly [K in keyof S]: IsAgainTerm<S[K]> extends true ? AgainAsField<K & string> : IsAgainSelectField<S[K]> extends true ? AgainSelectField<S[K], S, K & string> : S[K];
};
type ShapeAttrOf<F> = F extends {
    readonly _tag: "optional" | "default";
    readonly field: infer I;
} ? ShapeAttrOf<I> : F extends {
    readonly _tag: "select" | "nested" | "collection";
    readonly attr: infer A;
} ? A : F;
type IsReverseField<A> = A extends {
    readonly __reverse: true;
} ? true : false;
export type FocusShape<N extends AnyComposer, S> = {
    readonly [K in keyof S]: [IsReverseField<ShapeAttrOf<S[K]>>] extends [true] ? S[K] : [AttrIdent<ShapeAttrOf<S[K]>>] extends [FocusIdents<N>] ? S[K] : `select field "${K & string}" is not an attribute of the focus entity`;
};
export type FocusSelect<N extends AnyComposer, S> = S extends AllShape<infer M> ? [M] extends [N] ? S : `all(...) is not the focus entity` : S & ValidShape<S> & FocusShape<N, S>;
type AgainSelectField<F, S, K extends string> = HasIdField<S> extends true ? AgainNsField<F, S, K> : AgainMissingId;
type AgainNsField<F, S, K extends string> = AgainTargetNs<F> extends ShapeNs<S> ? F : AgainNsMismatch<K, ShapeNs<S> & string>;
type IsManyRef<A> = IsMany<A> extends true ? A extends {
    readonly valueType: "ref";
} ? true : false : false;
export type NestedOrderKey = PathCarrier & {
    readonly cardinality?: "one";
};
export type NestedElemPred<A> = A extends {
    readonly valueType: "ref";
} ? (focus: Var<EidCell>) => Iterable<unknown> : (v: Var<AttrValue<A>>) => Iterable<unknown>;
export interface NestedOrderSpec {
    readonly key: NestedOrderKey;
    readonly dir?: OrderDir;
    readonly empty?: OrderEmpty;
}
export type NestedOrderBy = NestedOrderKey | NestedOrderSpec | readonly (NestedOrderKey | NestedOrderSpec)[];
/**
 * Pull-phase constraints on a nested collection, as one record — the typed
 * twin of the wire's own `{where, order, offset, limit}` map on a
 * `PullAttrSpec`. Deliberately a record, not a chain or a pipe: the engine
 * evaluates the four slots in a fixed order (`where` → `orderBy` → `offset`
 * → `limit`) whatever the source spelling, so the syntax carries no sequence
 * to mislead with. Evaluated *inside* the pull, after the outer `:order` /
 * `:offset` / `:limit` slice — constraints page the collection, never the
 * rows: an element-less collection is `[]`, not a dropped parent, so the
 * outer `limit` still counts rows the client keeps.
 *
 * ```ts
 * replies: Comment.replies.select(Ramose.again(4), {
 *   where: [is(Comment.deleted, false)],
 *   orderBy: { key: Comment.createdAt, dir: "asc" },
 *   limit: 20,
 * }),
 * ```
 *
 * `where` entries are ANDed filter fragments over the element (see
 * {@link NestedElemPred}); a card-many scalar takes the same record through
 * {@link values}, minus `orderBy` (its elements are values, with no
 * attributes to sort by).
 */
export interface NestedOpts<A = PathCarrier> {
    readonly where?: readonly NestedElemPred<A>[];
    readonly orderBy?: A extends {
        readonly valueType: "ref";
    } ? NestedOrderBy : never;
    readonly limit?: number;
    readonly offset?: number;
}
export type AttrNav<A extends PathCarrier> = A & {
    readonly optional: ReturnType<typeof optional<A>>;
    readonly orDefault: IsDefaultable<A> extends true ? (value: AttrValue<A>) => PullDefault<A> : never;
    readonly select: A extends {
        readonly valueType: "ref";
    } ? RefSelect<A> : never;
};
/** A card-many **scalar** collection with pull-phase constraints — the field
 * {@link values} builds. Inert: the constraints are already lowered. */
export interface ValuesField<A = PathCarrier> {
    readonly _tag: "collection";
    readonly attr: A;
    readonly constraints: PullNestedConstraints;
}
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
export declare const values: <A extends PathCarrier>(attr: A, opts?: Omit<NestedOpts<A>, "orderBy">) => ValuesField<A>;
export interface SelectNested<A = unknown, S = unknown> {
    readonly _tag: "select";
    readonly attr: A;
    readonly shape: S;
    readonly constraints?: PullNestedConstraints;
    readonly optional: {
        readonly _tag: "optional";
        readonly field: SelectNested<A, S>;
    };
}
export declare const makeSelectNested: (attr: PathCarrier, shape: Shape | AllShape | Again, constraints?: PullNestedConstraints) => SelectNested<PathCarrier, Shape | AllShape | Again>;
export declare const attachAttrNav: <A extends PathCarrier>(attr: A) => AttrNav<A>;
export declare const isSelectNested: (x: unknown) => x is SelectNested;
export declare const shapeToPullMap: (shape: Shape) => Record<string, unknown>;
export type SelectResult<S> = {
    readonly [K in keyof S]: SelectFieldResult<S[K], S>;
};
type NestedSelectResult<A, S, Enclosing = unknown> = [S] extends [
    {
        readonly _tag: "again";
        readonly depth: infer D extends number;
    }
] ? A extends {
    readonly cardinality: "many";
} ? readonly Unroll<Enclosing, D>[] : Unroll<Enclosing, D> : [S] extends [
    {
        readonly _tag: "all";
        readonly ns: infer N extends AnyEntity;
    }
] ? A extends {
    readonly cardinality: "many";
} ? readonly AllRow<N>[] : AllRow<N> : A extends {
    readonly cardinality: "many";
} ? readonly SelectResult<S & object>[] : SelectResult<S & object>;
type SchemaType<S> = S extends {
    readonly Type: infer T;
} ? T : S extends {
    readonly schema: {
        readonly Type: infer T;
    };
} ? T : never;
type SelectFieldResult<F, Enclosing = unknown> = F extends {
    readonly _tag: "default";
    readonly field: infer Inner;
} ? SelectFieldResult<Inner, Enclosing> : F extends {
    readonly _tag: "optional";
    readonly field: infer Inner;
} ? SelectFieldResult<Inner, Enclosing> | undefined : F extends {
    readonly _tag: "select";
    readonly attr: infer A;
    readonly shape: infer S;
} ? NestedSelectResult<A, S, Enclosing> : F extends {
    readonly _tag: "nested";
    readonly attr: infer A;
    readonly pattern: infer P;
} ? NestedSelectResult<A, P, Enclosing> : F extends {
    readonly _tag: "collection";
    readonly attr: infer A;
} ? readonly SchemaType<A>[] : F extends {
    readonly schema: infer S;
    readonly cardinality: infer Card;
} ? F extends {
    readonly ident: ":db/id";
} ? IdCell<F> : Card extends "many" ? readonly SchemaType<F>[] : SchemaType<F> : F extends {
    readonly ident: ":db/id";
} ? IdCell<F> : never;
export declare const resetGensym: () => void;
export declare const lowerOrderPath: (root: string, path: readonly string[], revs: readonly boolean[]) => {
    readonly var: string;
    readonly clauses: unknown[];
};
export declare const requiredClauses: (e: string, pattern: unknown) => unknown[];
export {};
//# sourceMappingURL=shapes.d.ts.map