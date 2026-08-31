import type { PullElemOrder, PullElemPred } from "../internal/core/query/ast.ts";
import type * as Schema from "effect/Schema";
import type { AnySchema } from "./Schema.ts";
import type { Eid } from "./Eid.ts";
import type { AttrAtIdent, CatalogIdent, Ident } from "./idents.ts";
import type { AnyEntity, FieldMap } from "./Entity.ts";
import type { AnyComposer } from "./Composer.ts";
import { type SelfMarker } from "./valueTypes.ts";
export interface PullNestedConstraints {
    readonly where?: readonly PullElemPred[];
    readonly order?: readonly PullElemOrder[];
    readonly limit?: number;
    readonly offset?: number;
}
export interface PullOptional<F = unknown> {
    readonly _tag: "optional";
    readonly field: F;
    readonly select: F extends {
        readonly valueType: "ref";
    } ? {
        <const N extends AnyEntity>(pattern: AllShape<N>): PullOptional<PullNested<F, AllShape<N>>>;
        <const P extends Record<string, unknown>>(pattern: P): PullOptional<PullNested<F, P>>;
    } : never;
}
export interface PullDefault<F = unknown> {
    readonly _tag: "default";
    readonly field: F;
    readonly value: unknown;
}
export interface PullNested<A = unknown, P = unknown> {
    readonly _tag: "nested";
    readonly attr: A;
    readonly pattern: P;
    readonly constraints?: PullNestedConstraints;
    readonly optional: PullOptional<PullNested<A, P>>;
}
export type AttrPull<A> = {
    readonly optional: PullOptional<A>;
};
export declare const optional: <const F>(field: F) => PullOptional<F>;
export declare const pullDefault: <const F>(field: F, value: unknown) => PullDefault<F>;
export declare const nested: <const A extends {
    readonly valueType: "ref";
}, const P extends Record<string, unknown>>(attr: A, pattern: P, constraints?: PullNestedConstraints) => PullNested<A, P>;
/** Same-namespace shortcut: `pick(User, "name", "age")`. */
export declare const pick: <const N extends {
    readonly fields: FieldMap;
}, const Keys extends readonly (keyof N["fields"] & string)[]>(ns: N, ...keys: Keys) => { readonly [K in Keys[number]]: N["fields"][K]; };
/**
 * `Ramose.all(Todo)` — the peer's wildcard pull (`[*]`), as a client term.
 *
 * It is **not** a shape the client expands into a map of every attribute:
 * lowering emits the literal `["*"]` and the peer answers it, so what comes
 * back is every datom the entity carries, keyed by ident (`":todo/title"`),
 * refs as `{":db/id": n}` and cardinality-many attributes as arrays.
 *
 * The namespace is what the *type* is read against — see {@link AllRow} — and
 * what the query is already scoped to; the value it carries is unused at
 * runtime. The same term nests under a ref `.select`:
 * `Todo.owner.select(all(User))` lowers to the peer's `{:todo/owner [*]}`.
 */
export interface AllShape<N extends AnyEntity = AnyEntity> {
    readonly _tag: "all";
    readonly ns: N;
}
/**
 * Every attribute of the matched entity: `query(Todo).select(all(Todo))`,
 * `Todo.owner.select(all(User))` under a ref, or `db.pull(eid, all(Todo))`.
 * The same wildcard `db.pull(eid, ["*"])` asks for, with the namespace's
 * idents typed.
 */
export declare const all: <const N extends AnyEntity>(ns: N) => AllShape<N>;
export declare const isAllShape: (value: unknown) => value is AllShape;
/** Hop bound `again` accepts: a positive integer literal, 1 through 16. */
export type RecurDepth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
export declare const AGAIN_MAX_DEPTH: 16;
export type ValidAgainDepth<D> = number extends D ? "Ramose.again(n) takes a positive integer literal 1..16 — not a number, a param, or \"...\"" : D extends RecurDepth ? unknown : "Ramose.again(n) takes a positive integer literal 1..16";
/**
 * `Ramose.again(n)` — re-apply the enclosing select on this edge, `n`
 * full-shape hops, then identity stubs. A shape term in the `.select` slot,
 * parallel to {@link all}: not a field, not a top-level builder method.
 */
export interface Again<D extends RecurDepth = RecurDepth> {
    readonly _tag: "again";
    readonly depth: D;
}
export declare const again: <const D extends number>(depth: D & ValidAgainDepth<D>) => Again<D & RecurDepth>;
export declare const isAgain: (value: unknown) => value is Again;
export declare const isPullOptional: (value: unknown) => value is PullOptional;
export declare const isPullDefault: (value: unknown) => value is PullDefault;
export declare const isPullNested: (value: unknown) => value is PullNested;
type SchemaType<S> = S extends Schema.Top ? Schema.Schema.Type<S> : never;
type ScalarResult<F> = F extends {
    readonly schema: infer S;
    readonly cardinality: infer Card;
} ? Card extends "many" ? readonly SchemaType<S>[] : SchemaType<S> : never;
type FieldsResult<F> = {
    readonly [K in keyof F]: FieldResult<F[K], F>;
};
export type IdCell<F> = F extends {
    readonly _ns?: infer N;
} ? [NonNullable<N>] extends [AnyComposer] ? Eid<NonNullable<N>> : number : number;
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
type UnwrapField<F> = F extends {
    readonly _tag: "optional" | "default";
    readonly field: infer I;
} ? UnwrapField<I> : F;
export type IdKey<S> = {
    [K in keyof S]-?: UnwrapField<S[K]> extends {
        readonly ident: ":db/id";
    } ? K : never;
}[keyof S];
/**
 * Identity only — what the engine emits when the hop budget or a cycle
 * stops us. The key is the shape's `:db/id` alias; the cell is branded.
 */
export type RecurStub<S> = {
    readonly [K in IdKey<S>]: IdCell<UnwrapField<S[K]>>;
};
type CardOf<A, T> = A extends {
    readonly cardinality: "many";
} ? readonly T[] : T;
type IsAgainSelect<F> = UnwrapField<F> extends {
    readonly _tag: "select";
    readonly shape: {
        readonly _tag: "again";
    };
} ? true : UnwrapField<F> extends {
    readonly _tag: "nested";
    readonly pattern: {
        readonly _tag: "again";
    };
} ? true : false;
type AgainUnrollField<F, S, D extends number> = F extends {
    readonly _tag: "optional";
    readonly field: infer I;
} ? AgainUnrollField<I, S, D> | undefined : F extends {
    readonly _tag: "select" | "nested";
    readonly attr: infer A;
} ? CardOf<A, D extends 1 ? RecurStub<S> : Unroll<S, Prev[D & keyof Prev]>> : never;
export type Unroll<S, D extends number> = {
    readonly [K in keyof S]: [IsAgainSelect<S[K]>] extends [true] ? AgainUnrollField<S[K], S, D> : FieldResult<S[K], S>;
};
type NestedResult<A, P, Enclosing = unknown> = [P] extends [
    {
        readonly _tag: "again";
        readonly depth: infer D extends number;
    }
] ? CardOf<A, Unroll<Enclosing, D>> : [P] extends [
    {
        readonly _tag: "all";
        readonly ns: infer N extends AnyEntity;
    }
] ? A extends {
    readonly cardinality: "many";
} ? readonly AllRow<N>[] : AllRow<N> : A extends {
    readonly cardinality: "many";
} ? readonly FieldsResult<P>[] : FieldsResult<P>;
type FieldResult<F, Enclosing = unknown> = F extends {
    readonly _tag: "default";
    readonly field: infer Inner;
} ? FieldResult<Inner, Enclosing> : F extends {
    readonly _tag: "optional";
    readonly field: infer Inner;
} ? FieldResult<Inner, Enclosing> | undefined : F extends PullNested<infer A, infer P> ? NestedResult<A, P, Enclosing> : F extends {
    readonly _tag: "select";
    readonly attr: infer A;
    readonly shape: infer P;
} ? NestedResult<A, P, Enclosing> : F extends {
    readonly _tag: "collection";
    readonly attr: infer A;
} ? A extends {
    readonly schema: infer S;
} ? readonly SchemaType<S>[] : never : F extends {
    readonly ident: ":db/id";
} ? IdCell<F> : ScalarResult<F>;
export type StructPullResult<P> = FieldsResult<P>;
export type IsAgainTerm<F> = F extends {
    readonly _tag: "again";
} ? true : F extends {
    readonly _tag: "optional" | "default";
    readonly field: infer I;
} ? IsAgainTerm<I> : false;
export type IsAgainSelectField<F> = IsAgainSelect<F>;
export type HasIdField<S> = true extends {
    [K in keyof S]: UnwrapField<S[K]> extends {
        readonly ident: ":db/id";
    } ? true : false;
}[keyof S] ? true : false;
export type HasAgainSelect<S> = true extends {
    [K in keyof S]: IsAgainSelect<S[K]>;
}[keyof S] ? true : false;
type FieldIdentNs<F> = UnwrapField<F> extends {
    readonly ident: `:${infer Ns}/${string}`;
} ? Ns : UnwrapField<F> extends {
    readonly ident: ":db/id";
    readonly _ns?: infer N;
} ? N extends {
    readonly ns: infer Ns extends string;
} ? Ns : never : UnwrapField<F> extends {
    readonly _tag: "select" | "nested";
    readonly attr: infer A;
} ? FieldIdentNs<A> : never;
export type ShapeNs<S> = {
    [K in keyof S]: FieldIdentNs<S[K]>;
}[keyof S];
type AgainAttr<F> = F extends {
    readonly _tag: "optional" | "default";
    readonly field: infer I;
} ? AgainAttr<I> : F extends {
    readonly _tag: "select" | "nested";
    readonly attr: infer A;
} ? A : never;
export type AgainTargetNs<F> = AgainAttr<F> extends {
    readonly ident: `:${infer Own}/${string}`;
} ? AgainAttr<F> extends {
    readonly schema: {
        readonly _resolve?: () => {
            readonly fields: infer T;
        };
    };
} ? unknown extends T ? Own : [T] extends [SelfMarker] ? Own : AgainAttr<F> extends {
    readonly schema: {
        readonly _resolve?: () => {
            readonly ns: infer Ns;
        };
    };
} ? Ns extends string ? Ns : Own : Own : Own : never;
export type AgainAsField<K extends string> = `select field "${K}" is again: again is a shape, not a field — write \`ref.select(Ramose.again(n))\``;
export type AgainNsMismatch<K extends string, Ns extends string> = `select field "${K}" is again on a different namespace — again re-applies this shape, which is a :${Ns}/… row`;
export type AgainMissingId = "a shape that contains again must select N.id — the stub is that branded id cell";
export type TopLevelAgain = "again is not a top-level shape — write it on a self-ref: ref.select(Ramose.again(n))";
export type IdentPullAttr<C extends AnySchema> = CatalogIdent<C> | {
    readonly ident: CatalogIdent<C>;
} | "*";
export type IdentPullPattern<C extends AnySchema> = readonly IdentPullAttr<C>[];
type IdentOfPull<C extends AnySchema, A> = A extends "*" ? "*" : A extends {
    readonly ident: infer I extends string;
} ? I : A extends CatalogIdent<C> ? A : never;
export type IdentPullIdents<C extends AnySchema, P extends IdentPullPattern<C>> = IdentOfPull<C, P[number]>;
type PullValue<A> = A extends {
    readonly cardinality: "many";
} ? readonly PullValueOne<A>[] : PullValueOne<A>;
type PullValueOne<A> = A extends {
    readonly valueType: "ref";
} ? {
    readonly ":db/id": number;
} : A extends {
    readonly schema: infer S;
} ? SchemaType<S> : never;
type PullReadAtIdent<C extends AnySchema, I extends string> = PullValue<AttrAtIdent<C, I>>;
export type IdentPullResult<C extends AnySchema, P extends IdentPullPattern<C>> = "*" extends IdentPullIdents<C, P> ? {
    readonly ":db/id": number;
} & {
    readonly [I in CatalogIdent<C>]?: PullReadAtIdent<C, I>;
} : {
    readonly ":db/id"?: number;
} & {
    readonly [I in IdentPullIdents<C, P> & CatalogIdent<C>]?: PullReadAtIdent<C, I>;
};
/**
 * A wildcard row, read against one namespace: `:db/id` — the wildcard always
 * carries it — and every `:ns/attr` of `N`, each optional, because a datom the
 * entity does not have is a key the map does not have.
 *
 * **A lower bound, not an exact type.** The runtime map is a superset: query
 * scope is "at least one `:ns/*` datom", so a matched entity may carry any
 * other namespace's attributes too, and the peer returns those keys as well.
 * Typing them would mean naming a catalog, which a namespace-scoped query
 * does not have — so the keys named here are the ones you may rely on.
 */
export type AllRow<N extends AnyEntity> = {
    readonly ":db/id": number;
} & {
    readonly [A in keyof N["fields"] & string as Ident<N["ns"], A>]?: PullValue<N["fields"][A]>;
};
type IdentsIn<P> = [P] extends [PullOptional<infer I>] ? IdentsIn<I> : [P] extends [PullDefault<infer I>] ? IdentsIn<I> : [P] extends [{
    readonly _tag: "again";
}] ? never : [P] extends [
    {
        readonly _tag: "all";
        readonly ns: {
            readonly fields: infer A;
        };
    }
] ? IdentsIn<A> : [P] extends [PullNested<infer A, infer Inner>] ? IdentsIn<A> | IdentsIn<Inner> : [P] extends [
    {
        readonly _tag: "select";
        readonly attr: infer A;
        readonly shape: infer Inner;
    }
] ? IdentsIn<A> | IdentsIn<Inner> : [P] extends [{
    readonly ident: infer I extends string;
}] ? I : [P] extends [readonly unknown[]] ? IdentsInArray<P[number]> : [P] extends [object] ? IdentsInFields<P> : never;
type IdentsInArray<E> = [E] extends [string] ? E : IdentsIn<E>;
type IdentsInFields<F> = F extends object ? {
    [K in keyof F]: IdentsIn<F[K]>;
}[keyof F] : never;
/**
 * `P` when every named ident is in the catalog (or `*`); otherwise a
 * string literal so the call is a type error.
 *
 * {@link AllShape} names a whole namespace rather than fields, so it is
 * checked the same way, against the idents that namespace stamps.
 */
export type ValidatePull<C extends AnySchema, P> = [P] extends [
    {
        readonly _tag: "again";
    }
] ? TopLevelAgain : [P] extends [
    {
        readonly _tag: "all";
        readonly ns: {
            readonly fields: infer A;
        };
    }
] ? [IdentsIn<A>] extends [CatalogIdent<C>] ? P : "namespace is not in this database's catalog" : [P] extends [readonly unknown[]] ? ValidatePullIdents<C, P> : [P] extends [object] ? ValidatePullShape<C, P> : ValidatePullIdents<C, P>;
type HasAgainTermIn<S> = true extends {
    [K in keyof S]: IsAgainTerm<S[K]>;
}[keyof S] ? true : false;
type ValidatePullShape<C extends AnySchema, P> = HasAgainTermIn<P> extends true ? {
    readonly [K in keyof P]: IsAgainTerm<P[K]> extends true ? "again is a shape, not a field — write `ref.select(Ramose.again(n))`" : P[K];
} : HasAgainSelect<P> extends true ? HasIdField<P> extends true ? ValidatePullIdents<C, P> : {
    readonly [K in keyof P]: IsAgainSelectField<P[K]> extends true ? AgainMissingId : P[K];
} : ValidatePullIdents<C, P>;
type ValidatePullIdents<C extends AnySchema, P> = [IdentsIn<P>] extends [
    CatalogIdent<C> | "*" | ":db/id"
] ? P : "unknown attribute in pull pattern";
/**
 * Inferred result of `eid.pull(pattern)`. Fields object → caller
 * keys, required vs optional honored. Array → ident keys, all optional.
 * `all(N)` → the wildcard map, keyed by `N`'s idents ({@link AllRow}).
 */
export type Pull<C extends AnySchema, P> = [P] extends [
    {
        readonly _tag: "all";
        readonly ns: infer N extends AnyEntity;
    }
] ? AllRow<N> : [P] extends [readonly unknown[]] ? P extends IdentPullPattern<C> ? IdentPullResult<C, P> : never : StructPullResult<P>;
export declare const refTargetNs: (attr: unknown) => string | undefined;
export declare const idKeyOf: (pattern: unknown) => string | undefined;
export declare const assertAgainDepth: (depth: unknown) => number;
export declare const assertNotAgain: (shape: unknown, key?: string) => void;
export declare const assertAgainInShape: (shape: Record<string, unknown>) => void;
export declare const assertDirectField: (as: string, attr: unknown, leafSelects?: boolean) => void;
export declare const inspectPullField: (field: unknown) => {
    readonly optional: boolean;
    readonly hasDefault: boolean;
    readonly defaultValue: unknown;
    readonly many: boolean;
    readonly reverse: boolean;
    readonly nestedPattern: unknown | undefined;
    readonly constraints: PullNestedConstraints | undefined;
    readonly attr: unknown;
};
export declare const lowerPullPattern: (pattern: unknown) => unknown[];
export declare const pullReshapeIdentity: (pattern: unknown) => unknown;
export declare const mapPullEntityIds: (pattern: unknown, result: unknown, map: (eid: number) => unknown) => unknown;
export declare const reshapePullResult: (pattern: unknown, result: unknown) => unknown;
export {};
//# sourceMappingURL=Pull.d.ts.map