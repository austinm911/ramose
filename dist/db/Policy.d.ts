/**
 * Typed policy authoring. The document is head/body shaped like `Query.q`:
 * the head's `principal` attr derives `me`, and every arm is a fragment
 * (or `true`, or an OR of fragments) contextually checked against that
 * token. Combinators lower to named query rules at compile; every check
 * is deploy-time.
 */
import * as Schema from "effect/Schema";
import type { PolicyOperand } from "../internal/core/policy/ast.ts";
import { type AnyField } from "./Field.ts";
import type { AnySchema } from "./Schema.ts";
import type { Eid } from "./Eid.ts";
import type { CatalogIdent } from "./idents.ts";
import type { AnyEntity } from "./Entity.ts";
import type { AnyOperation, AnyOperations, Operation } from "./Operation.ts";
import { type AttrLike, type FilterStage, type QueryGen, type ReverseFilter, type Var } from "./query/index.ts";
import { PolicyError } from "./SchemaErrors.ts";
export { PolicyError };
export type Operand = PolicyOperand;
/** Public per-datom policy key. Writes are named operations, not datom verbs. */
export type Op = "read";
export declare const PUBLIC_POLICY_OPS: readonly Op[];
/** A stamped attribute (`User.sub`) — anything carrying `ident` + attr shape. */
export type AttrRef = AnyField & {
    readonly ident: string;
};
/**
 * The namespace the principal mapping names. `User.sub` under catalog `C`
 * yields `typeof User`, which is what brands `me`.
 */
export type NsOfPrincipal<C extends AnySchema, I extends string> = {
    [K in keyof C["entities"]]: I extends `:${C["entities"][K]["ns"]}/${string}` ? C["entities"][K] : never;
}[keyof C["entities"]];
/** `me` in every arm: a var branded with the principal's namespace. */
export type Me<N extends AnyEntity = AnyEntity> = Var<Eid<N>>;
export type PrincipalMe<C extends AnySchema, I extends string> = Me<NsOfPrincipal<C, I>>;
/**
 * Stamped field idents of an entity — the set a policy arm may mention.
 * Trait fields keep the trait's ident (`Issue.tags` → `:taggable/tags`)
 * while still belonging to the composing entity's field set.
 */
export type EntityFieldIdent<N extends AnyEntity> = {
    [K in keyof N["fields"]]: N["fields"][K] extends {
        readonly ident: infer I extends string;
    } ? I : never;
}[keyof N["fields"]];
/** A stamped field of `N` — the `A` a forward `FilterStage` may capture. */
type EntityField<N extends AnyEntity> = N["fields"][keyof N["fields"]];
/**
 * `(me) => fragment` — the arm closes over the typed principal token.
 * A `Query.is` / `Query.has` filter must name a field of `N` (`InFocus`).
 * `Query.some` / `none` / `every` are `ReverseFilter` (the ref must point
 * at the focus when applied to a pipeline). `byId`, `updatedSince`, and
 * `assertedBy` are unbranded `FilterStage` (valid on every entity). A
 * handwritten generator is branded with `N` as its focus; `{ _ident?: never }`
 * keeps a wrong-entity `Query.is` from sneaking through the generator branch.
 */
export type FragFn<M, N extends AnyEntity = AnyEntity> = (me: M) => FilterStage<N, EntityField<N>> | FilterStage | ReverseFilter<AttrLike> | ((focus: Var<Eid<N>>) => QueryGen<unknown> & {
    readonly _ident?: never;
});
/**
 * JWT claims gate. `class` is checked before the rule runs; it never
 * grows an expression tree. `rule` defaults to `true` (public).
 */
export interface ClassGate<A = true, CL extends string = string> {
    readonly _tag: "ClassGate";
    readonly classes: readonly CL[];
    readonly arm: A;
}
export interface ClassFn<CL extends string = string> {
    readonly _tag: "ClassGate";
    readonly classes: readonly CL[];
    readonly arm: true;
    <A>(arm: A): ClassGate<A, CL>;
}
/**
 * JWT class gate as a config record — `rule` is contextually typed, so
 * inline `(me) => …` needs no annotation. `rule` defaults to `true`.
 */
export type ClassConfig<M, N extends AnyEntity = AnyEntity, CL extends string = string> = {
    readonly class: CL | readonly CL[];
    readonly rule?: true | FragFn<M, N>;
};
/** One allow arm: a fragment, `true` (empty / public), or a class gate. */
export type ArmValue<M, N extends AnyEntity = AnyEntity, CL extends string = string> = true | FragFn<M, N> | ClassGate<true | FragFn<M, N>, CL> | ClassConfig<M, N, CL>;
/** Arms per op; an array is OR. Only `read` — writes are {@link OperationArms}. */
export type RuleSpec<M, N extends AnyEntity = AnyEntity, CL extends string = string> = {
    readonly [K in Op]?: ArmValue<M, N, CL> | readonly ArmValue<M, N, CL>[];
};
export interface AttrRule<M = unknown, N extends AnyEntity = AnyEntity, CL extends string = string> {
    readonly _tag: "AttrRule";
    readonly attr: string;
    readonly rules: RuleSpec<M, N, CL>;
}
export type NsRuleSpec<M, N extends AnyEntity = AnyEntity, CL extends string = string> = RuleSpec<M, N, CL> & {
    readonly attrs?: readonly AttrRule<M, N, CL>[];
};
/**
 * Class-only arm: a bare (no-`on`) operation cannot name a rule fragment.
 * `rule` may only be `true` (or omitted).
 */
export type ClassOnlyArm<CL extends string = string> = true | ClassGate<true, CL> | {
    readonly class: CL | readonly CL[];
    readonly rule?: true;
};
/** An operation with `on:` takes a full arm (class + optional rule). */
export type OperationArmValue<O extends AnyOperation, M, CL extends string = string> = O extends Operation<any, any, any, infer N, any> ? [N] extends [undefined] ? ClassOnlyArm<CL> | readonly ClassOnlyArm<CL>[] : N extends AnyEntity ? ArmValue<M, N, CL> | readonly ArmValue<M, N, CL>[] : ClassOnlyArm<CL> | readonly ClassOnlyArm<CL>[] : ClassOnlyArm<CL> | readonly ClassOnlyArm<CL>[];
/** Typed keys off the registry — no string op names in app code. */
export type OperationArms<Ops extends AnyOperations, M, CL extends string = string> = {
    readonly [K in keyof Ops["operations"]]?: OperationArmValue<Ops["operations"][K], M, CL>;
};
export interface PolicyHead<C extends AnySchema = AnySchema, CL extends readonly string[] = readonly string[], CF extends Schema.Struct.Fields = Schema.Struct.Fields> {
    readonly schema: C;
    /** attribute whose value is the JWT `sub` — derives `me`'s type */
    readonly principal: AttrRef & {
        readonly ident: CatalogIdent<C>;
    };
    readonly classes: CL;
    /**
     * Class whose holders bypass every rule. `P.class(superuser)` in an
     * arm is unreachable and rejected. Omit to have no bypass class.
     */
    readonly superuser?: CL[number];
    /**
     * Classes that may install or grow schema. Defaults to `[superuser]`.
     * Distinct from bypass — a schema class still runs the rules.
     */
    readonly schemaClasses?: readonly CL[number][];
    /** shape of `ramose.attrs` */
    readonly claims?: Schema.Struct<CF>;
    /** The app's operations registry — types the body's `operations:` keys. */
    readonly operations?: AnyOperations;
}
export type PolicyArms<C extends AnySchema, M, CL extends readonly string[] = readonly string[], Ops extends AnyOperations | undefined = undefined> = {
    readonly [K in keyof C["entities"]]?: NsRuleSpec<M, C["entities"][K], CL[number]>;
} & (Ops extends AnyOperations ? {
    readonly operations?: OperationArms<Ops, M, CL[number]>;
} : {
    readonly operations?: undefined;
});
interface CompiledArm {
    readonly classes?: readonly string[];
    readonly rule: true | string;
}
interface NsRules {
    readonly prefix: string;
    readonly rules: Readonly<Record<string, readonly CompiledArm[]>>;
    readonly attrs: Readonly<Record<string, Readonly<Record<string, readonly CompiledArm[]>>>>;
}
/** A policy bound to its catalog. `compile` lowers it to the wire JSON. */
export interface Policy<C extends AnySchema = AnySchema, CL extends readonly string[] = readonly string[], SU extends CL[number] | undefined = CL[number] | undefined> {
    readonly _tag: "Policy";
    readonly schema: C;
    readonly principal: string;
    readonly classes: CL;
    readonly superuser?: SU;
    readonly schemaClasses: readonly CL[number][];
    readonly claims?: Schema.Struct<Schema.Struct.Fields>;
    /** catalog namespace key → normalised rules */
    readonly ns: Readonly<Record<string, NsRules>>;
    /** wire op name → compiled arms */
    readonly operations: Readonly<Record<string, readonly CompiledArm[]>>;
    /** registered op names with no arm — superuser-only */
    readonly unarmedOperations: readonly string[];
    /** lowered query-engine rule definitions */
    readonly ruleDefs: readonly unknown[];
    /** idents whose attribute rule narrows their namespace's `read` */
    readonly maskedReads: ReadonlySet<string>;
}
/** The declared classes of a policy value: `Ramose.Policy.Class<typeof policy>`. */
export type Class<P extends {
    readonly classes: readonly string[];
}> = P["classes"][number];
/** Keep `CL` inferred from the head, not widened by arm literals. */
type NoInfer<T> = [T][T extends unknown ? 0 : never];
/** Arm class names: the head's `classes` minus `superuser` (unreachable). */
type ArmClasses<CL extends readonly string[], SU> = readonly Exclude<CL[number], SU>[];
export type ClaimOperand = {
    readonly _tag: "claim";
    readonly path: readonly string[];
};
export interface ClaimAccess<Attrs> {
    readonly sub: ClaimOperand;
    readonly iss: ClaimOperand;
    readonly aud: ClaimOperand;
    readonly exp: ClaimOperand;
    /** app claims (`ramose.attrs`) */
    readonly attrs: Attrs;
}
/** `P.claim.sub`, `P.claim.attrs.org`. */
export declare const claim: ClaimAccess<Record<string, ClaimOperand>>;
/** Same accessor with `attrs` keyed by a claims struct: `P.claimOf(S).attrs.org`. */
export declare const claimOf: <CF extends Schema.Struct.Fields>(_struct: Schema.Struct<CF>) => ClaimAccess<{ readonly [K in keyof CF & string]: ClaimOperand; }>;
/** The principal's resolved entity id — a claim-style operand, not a rule. */
export declare const principal: Operand;
/**
 * JWT class gate. `P.class("member")` is a public arm for that class;
 * `P.class("member")(frag)` / `{ class: "member", rule: frag }` compose
 * the gate with a fragment. Checked before the rule runs; never an
 * expression.
 */
export declare const classFn: <const Cls extends string>(...classes: Cls[]) => ClassFn<Cls>;
export { classFn as class };
/** Field rule; narrows (ANDs with) its entity rule. Only `read` arms. */
export declare const field: <A extends AttrRef, M, N extends AnyEntity = AnyEntity, CL extends string = string>(a: A, rules: RuleSpec<M, N, CL>) => AttrRule<M, N, CL>;
/**
 * Build a policy. `policy(head, arms)` is head/body shaped like `Query.q`:
 * `principal: User.sub` derives `me`, and every inline arm is checked as
 * `(me) => fragment` with `me` fully typed. Writes are the `operations:`
 * section — keys are the app registry's bindings, lowered to op names on
 * the wire. Unknown idents, undeclared classes and unknown namespace keys
 * fail here. `superuser` / `schemaClasses` are required to resolve to at
 * least one class that may install schema; `P.class(superuser)` in an arm
 * is unreachable and rejected.
 */
export declare function policy<const C extends AnySchema, const I extends CatalogIdent<C>, const CL extends readonly string[], const SU extends CL[number] | undefined = undefined, CF extends Schema.Struct.Fields = Schema.Struct.Fields, const Ops extends AnyOperations | undefined = undefined>(head: {
    readonly schema: C;
    readonly principal: AttrRef & {
        readonly ident: I;
    };
    readonly classes: CL;
    readonly superuser?: SU & CL[number];
    readonly schemaClasses?: readonly CL[number][];
    readonly claims?: Schema.Struct<CF>;
    readonly operations?: Ops;
}, arms: PolicyArms<C, PrincipalMe<C, I>, NoInfer<ArmClasses<CL, SU>>, Ops>): Policy<C, CL, SU>;
export interface CompileOptions {
    /** app pull patterns, checked for read-masked attributes used as required */
    readonly pulls?: readonly unknown[];
    /**
     * The operations registry this deploy ships. Every `operations:` key
     * must be a registered op; a rule arm on a registry-bare op fails.
     * Registered ops with no arm are listed as superuser-only.
     */
    readonly operations?: AnyOperations;
}
/**
 * Deploy-time coverage: every armed name must be in the registry.
 * A named-rule or db-dependent v1 arm on a registry-bare (no-`on`) op
 * is rejected — those arms need a resolved target. Unarmed registered
 * ops are returned — they deny everyone but superuser.
 */
export declare const checkOperationsPolicyCoverage: (registry: AnyOperations, armed: ReadonlySet<string> | readonly string[] | Readonly<Record<string, unknown>>) => {
    readonly unarmed: readonly string[];
};
/**
 * Fail closed at deploy: only the principal ident, a string-typed
 * `role` sibling, and optional / card-many fields are provisionable.
 * The peer writes `role` only when that attr is string-typed — a
 * required card-one non-string `role` is not provisionable. The peer
 * *may* stamp matching `ramose.attrs` at login, but those keys are
 * per-token and never guaranteed — they do not make a required field
 * provisionable. A required card-one field beyond principal + string
 * role makes first login `tx/required`. Mark those fields
 * `optional: true` (or use a schema AST that admits `undefined`).
 */
export declare const checkPrincipalProvisioning: (schema: AnySchema, principalIdent: string) => void;
/**
 * `reshapePullResult` drops an entity that is missing a *required* key, so a
 * read-masked attribute pulled as required would delete the row instead of
 * redacting the field. Deploy-time error, not a printed list.
 *
 * `.orDefault(v)` is required for this purpose, deliberately: it is not a way
 * to keep the row. The masked datom comes back absent, so the default would
 * *stand in* for it — the caller reads `v` as if it were the hidden value,
 * which is worse than the `undefined` `.optional` gives them. Fail closed:
 * only `.optional` (or a card-many field, which is `[]`) passes.
 */
export declare const checkPulls: (p: Policy, pulls: readonly unknown[]) => void;
/** Compile to the wire JSON. Round-tripped through core's `parsePolicy`. */
export declare const compile: (p: Policy, options?: CompileOptions) => string;
//# sourceMappingURL=Policy.d.ts.map