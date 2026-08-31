import type * as SchemaNS from "effect/Schema";
import * as Schema from "effect/Schema";
export type DbValueType = "string" | "long" | "double" | "boolean" | "ref" | "uuid" | "instant" | "bytes";
export declare const toWireValueType: (vt: DbValueType) => `:db.type/${DbValueType}`;
declare const RamoseVt: unique symbol;
declare const RefTarget: unique symbol;
declare const SelfRef: unique symbol;
export type RamoseVt<VT extends DbValueType> = {
    readonly [RamoseVt]: VT;
};
export type InferDbValueType<S> = S extends RamoseVt<infer V> ? V : S extends {
    readonly ast: {
        readonly _tag: infer Tag;
    };
} ? Tag extends "String" ? "string" : Tag extends "Number" ? "double" : Tag extends "Boolean" ? "boolean" : undefined : undefined;
type JsOfVt<VT extends DbValueType> = VT extends "string" | "uuid" ? string : VT extends "long" | "double" | "ref" ? number : VT extends "boolean" ? boolean : VT extends "instant" ? Date : VT extends "bytes" ? Uint8Array : never;
type PairableType<S extends Schema.Top, VT extends DbValueType> = Exclude<Schema.Schema.Type<S>, null | undefined> extends JsOfVt<VT> ? S : S & {
    readonly "stored(schema, vt): this Schema's Type does not match the value type": true;
};
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
export type TargetedRef<TargetFields extends object = object, Ns extends string = string, Target = unknown> = Schema.Schema<number> & {
    readonly [RefTarget]?: TargetFields;
    readonly _resolve?: () => {
        readonly fields: TargetFields;
        readonly ns: Ns;
    };
    readonly _self?: boolean;
    readonly _target?: Target;
} & RamoseVt<"ref">;
export type SelfMarker = {
    readonly [SelfRef]: true;
};
type EntityLike = {
    readonly _tag?: "Entity" | "Trait";
    readonly fields: object;
    readonly ns: string;
};
type RefFn = {
    <const N extends EntityLike>(target: N): TargetedRef<N["fields"], N["ns"], N>;
    <const N extends EntityLike>(target: () => N): TargetedRef<N["fields"], N["ns"], N>;
    readonly self: TargetedRef<SelfMarker>;
} & RamoseVt<"ref">;
export declare const untargetedRef: SchemaNS.Finite & RamoseVt<"ref">;
export declare const Ref: RefFn;
export declare const rememberValueType: (schema: object, vt: DbValueType) => void;
export type Ref = number;
export declare const isSelfRefSchema: (schema: unknown) => boolean;
export declare const refTargetOf: (schema: unknown) => (() => {
    readonly _tag?: "Entity" | "Trait";
    readonly fields: object;
    readonly ns?: string;
}) | undefined;
/** Integer long. Lowers to `:db.type/long` (plain `Schema.Number` is double). */
export declare const Long: SchemaNS.Finite & RamoseVt<"long">;
export type Long = Schema.Schema.Type<typeof Long>;
/** Instant. Lowers to `:db.type/instant`. */
export declare const Instant: SchemaNS.Date & RamoseVt<"instant">;
export type Instant = Schema.Schema.Type<typeof Instant>;
/** Byte array. Lowers to `:db.type/bytes`. */
export declare const Bytes: SchemaNS.Uint8Array & RamoseVt<"bytes">;
export type Bytes = Schema.Schema.Type<typeof Bytes>;
export declare const enumSchema: <const L extends readonly [string, ...string[]]>(values: L) => Schema.Literals<L> & RamoseVt<"string">;
export declare const enumMembersOf: (schema: object) => readonly [string, ...string[]] | undefined;
export declare const tryInferDbValueType: (schema: SchemaNS.Top, override?: DbValueType) => DbValueType | undefined;
export declare const inferDbValueType: (schema: SchemaNS.Top, override?: DbValueType) => DbValueType;
export {};
//# sourceMappingURL=valueTypes.d.ts.map