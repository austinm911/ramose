/** Public value-type names (`"string"`) and Effect Schema helpers that lower onto `:db.type/*`. */
import type * as SchemaNS from "effect/Schema";
import * as Schema from "effect/Schema";
export type DbValueType = "string" | "long" | "double" | "boolean" | "ref" | "uuid" | "instant" | "bytes";
export declare const toWireValueType: (vt: DbValueType) => `:db.type/${DbValueType}`;
declare const RamoseVt: unique symbol;
declare const RefTarget: unique symbol;
declare const SelfRef: unique symbol;
/** Type-level brand so `Field(Long)` stamps `valueType` without an option. */
export type RamoseVt<VT extends DbValueType> = {
    readonly [RamoseVt]: VT;
};
/**
 * `:db.type/*` inferred from a value Schema, as a public name. Helper brands
 * win; then the AST tag of the common primitives (`String` / `Number` /
 * `Boolean`). Anything else — literals, unions, structs, refinements — is
 * `undefined` (wrap with {@link stored}, or use {@link enumSchema} /
 * `Enum` for a string-literal set). Mirrors {@link tryInferDbValueType}:
 * unknown shapes do not silently become the wrong value type.
 */
export type InferDbValueType<S> = S extends RamoseVt<infer V> ? V : S extends {
    readonly ast: {
        readonly _tag: infer Tag;
    };
} ? Tag extends "String" ? "string" : Tag extends "Number" ? "double" : Tag extends "Boolean" ? "boolean" : undefined : undefined;
/**
 * JS type a value type stores. Pairing is decoded-Type only — not
 * encoded-side AST inference (a refinement over {@link Long} would
 * silently look like `"double"`).
 */
type JsOfVt<VT extends DbValueType> = VT extends "string" | "uuid" ? string : VT extends "long" | "double" | "ref" ? number : VT extends "boolean" ? boolean : VT extends "instant" ? Date : VT extends "bytes" ? Uint8Array : never;
/**
 * Type↔vt pairing, as a brand-key error instead of `never`.
 * `Schema.optional(String)` with `"string"` is fine; `Schema.Boolean`
 * with `"string"` is not.
 */
type PairableType<S extends Schema.Top, VT extends DbValueType> = Exclude<Schema.Schema.Type<S>, null | undefined> extends JsOfVt<VT> ? S : S & {
    readonly "stored(schema, vt): this Schema's Type does not match the value type": true;
};
/**
 * Accept a matching Type↔vt pair; reject a schema already branded
 * with a *different* vt. Re-branding (`stored(Uuid, "string")`)
 * intersects the two `RamoseVt` keys (`"uuid" & "string"` → `never`),
 * which collapses the field to `Field<never, …>` and types its row
 * cell as a ref while runtime still installs the requested vt.
 * Same-vt re-brands (`stored(Uuid, "uuid")`) are a no-op.
 */
type PairableSchema<S extends Schema.Top, VT extends DbValueType> = S extends RamoseVt<infer V> ? [V, VT] extends [VT, V] ? PairableType<S, VT> : S & {
    readonly "stored(schema, vt): already branded — pass the unbranded Schema": true;
} : PairableType<S, VT>;
/**
 * Brand a raw Effect Schema with its storage form so {@link Field} can
 * infer `:db.type/*`. The advanced-form hatch — `valueType` is not a
 * field option.
 *
 * ```ts
 * Field(stored(Schema.Literals(["on", "off"]), "string"))
 * Field(stored(Schema.String, "uuid"))
 * ```
 *
 * The pair is checked: `"instant"` needs a `Date`-typed schema,
 * `"string"` / `"uuid"` a string-typed one, and so on. A mismatch
 * (`stored(Schema.Boolean, "string")`) is a type error. An already
 * branded helper (`Uuid`, `Long`, a previous `stored`) may only
 * re-brand with the same vt — pass the unbranded Schema to change it.
 */
export declare const stored: <S extends Schema.Top, const VT extends DbValueType>(schema: PairableSchema<S, VT>, vt: VT) => S & RamoseVt<VT>;
/**
 * UUID as a canonical string. Lowers to `:db.type/uuid`. The `{ vt: 6, v }`
 * tagged form is wire-internal — the public type is `string`.
 */
export declare const Uuid: SchemaNS.String & RamoseVt<"uuid">;
export type Uuid = Schema.Schema.Type<typeof Uuid>;
/** Targeted ref schema — carries the target entity's field map. */
export type TargetedRef<TargetFields extends object = object, Ns extends string = string, Target = unknown> = Schema.Schema<number> & {
    readonly [RefTarget]?: TargetFields;
    readonly _resolve?: () => {
        readonly fields: TargetFields;
        readonly ns: Ns;
    };
    readonly _self?: boolean;
    /**
     * Phantom: the entity `Ref(User)` was declared against. Brands
     * `{ id: Eid<User> }` on a default fluent row. Never at runtime.
     */
    readonly _target?: Target;
} & RamoseVt<"ref">;
export type SelfMarker = {
    readonly [SelfRef]: true;
};
type EntityLike = {
    readonly fields: object;
    readonly ns: string;
};
type RefFn = {
    /**
     * Targeted ref. Prefer the entity itself (`Ref(User)`); pass a thunk only
     * when the target is declared later (`Ref(() => Other)`).
     */
    <const N extends EntityLike>(target: N | (() => N)): TargetedRef<N["fields"], N["ns"], N>;
    /** Self-ref; `Entity` substitutes the enclosing field map. */
    readonly self: TargetedRef<SelfMarker>;
} & RamoseVt<"ref">;
/**
 * Entity reference. `Ref(User)` (eager) or `Ref(() => User)` (thunk, for
 * cycles) so navigational paths (`Todo.owner.name`) have a target.
 */
/** Untargeted ref — the branded schema `Field(Ref)` / `Field(Ramose.Ref)` uses. */
export declare const untargetedRef: SchemaNS.Number & RamoseVt<"ref">;
export declare const Ref: RefFn;
/**
 * Stamp a schema object so {@link tryInferDbValueType} sees it. The
 * public hatch is {@link stored}; this remains for non-schema objects
 * (`Field`'s `Ref` function).
 */
export declare const rememberValueType: (schema: object, vt: DbValueType) => void;
export type Ref = number;
export declare const isSelfRefSchema: (schema: unknown) => boolean;
export declare const refTargetOf: (schema: unknown) => (() => {
    readonly fields: object;
    readonly ns?: string;
}) | undefined;
/** Integer long. Lowers to `:db.type/long` (plain `Schema.Number` is double). */
export declare const Long: SchemaNS.Number & RamoseVt<"long">;
export type Long = Schema.Schema.Type<typeof Long>;
/** Instant. Lowers to `:db.type/instant`. */
export declare const Instant: SchemaNS.Date & RamoseVt<"instant">;
export type Instant = Schema.Schema.Type<typeof Instant>;
/** Byte array. Lowers to `:db.type/bytes`. */
export declare const Bytes: SchemaNS.Uint8Array & RamoseVt<"bytes">;
export type Bytes = Schema.Schema.Type<typeof Bytes>;
/**
 * String-literal union branded as `:db.type/string`. Used by
 * {@link import("./Field.ts").Enum}.
 */
export declare const enumSchema: <const L extends readonly [string, ...string[]]>(values: L) => Schema.Literals<L> & RamoseVt<"string">;
/** Closed-set members attached by {@link enumSchema}, if any. */
export declare const enumMembersOf: (schema: object) => readonly [string, ...string[]] | undefined;
export declare const tryInferDbValueType: (schema: SchemaNS.Top, override?: DbValueType) => DbValueType | undefined;
/**
 * Pick the public value-type name for a value Schema. An explicit
 * override (the field's already-resolved `valueType`) wins; then the
 * helpers above; then the AST tag of the common primitives. Anything
 * else must be wrapped with {@link stored}.
 */
export declare const inferDbValueType: (schema: SchemaNS.Top, override?: DbValueType) => DbValueType;
export {};
//# sourceMappingURL=valueTypes.d.ts.map