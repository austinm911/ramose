import type { AnyEntity } from "../../../db/Entity.ts";
import { OwnedOperations, type AnyOwnedOperation } from "../../../db/Operation.ts";
import type { EntityMap, Schema } from "../../../db/Schema.ts";
import type { PathCarrier } from "../../../db/shapes.ts";
import type { AnyTrait } from "../../../db/Trait.ts";
import type { ClaimDescriptor } from "../principal.ts";
import type { AuthExpr, AuthPathLike, AuthPathProxy, BoxedOperand, CompileReadAuthorizationInput } from "./types.ts";
type PrincipalField<Field, Namespace extends string> = Field extends PathCarrier & {
    readonly ident: `:${Namespace}/${string}`;
    readonly cardinality: "one";
    readonly unique: "strict" | "upsert";
    readonly valueType: "string" | "uuid";
} ? Field : never;
type EntityPrincipalFields<Es extends EntityMap> = {
    readonly [K in keyof Es]: Es[K] extends {
        readonly ns: infer Namespace extends string;
        readonly fields: infer Fields;
    } ? PrincipalField<Fields[keyof Fields], Namespace> : never;
}[keyof Es];
export type SchemaPrincipalField<Es extends EntityMap> = EntityPrincipalFields<Es>;
type DirectTraits<Owner> = Owner extends {
    readonly traits: readonly (infer Trait)[];
} ? Trait extends AnyTrait ? Trait : never : never;
type TraitClosure<Trait, SeenNames extends string = never> = Trait extends AnyTrait ? Trait["ns"] extends SeenNames ? never : Trait | TraitClosure<DirectTraits<Trait>, SeenNames | Trait["ns"]> : never;
type ReachableTrait<Es extends EntityMap> = string extends keyof Es ? never : TraitClosure<DirectTraits<Es[keyof Es]>>;
type ScalarClaimValue<ValueType> = ValueType extends "string" ? string : ValueType extends "long" | "double" ? number : ValueType extends "boolean" ? boolean : never;
type ClaimValue<Descriptor> = Descriptor extends {
    readonly shape: infer Shape;
} ? Shape extends {
    readonly _tag: "scalar";
    readonly valueType: infer ValueType;
} ? ScalarClaimValue<ValueType> : Shape extends {
    readonly _tag: "array";
    readonly items: {
        readonly valueType: infer ValueType;
    };
} ? readonly ScalarClaimValue<ValueType>[] : never : never;
type OperandOf<Tag extends BoxedOperand["_tag"]> = Extract<BoxedOperand, {
    readonly _tag: Tag;
}>;
type ContainedValue<Value> = Value extends readonly (infer Element)[] ? Element : Value;
type LiteralValue<Value> = Value extends readonly unknown[] ? never : Value;
declare const PolicyOperandValue: unique symbol;
type SymbolicOperand<Value> = AuthPathLike | PathCarrier | PolicyOperand<"claim", Value> | ([Value] extends [string] ? PolicyOperand<"subject", string> : never);
export type PolicyOperand<Tag extends BoxedOperand["_tag"], Value = unknown> = OperandOf<Tag> & {
    readonly [PolicyOperandValue]?: Value;
    readonly eq: (rhs: SymbolicOperand<Value> | LiteralValue<Value>) => AuthExpr;
} & (Value extends readonly unknown[] ? {
    readonly contains: (rhs: SymbolicOperand<ContainedValue<Value>> | ContainedValue<Value>) => AuthExpr;
} : {});
type ClaimOperands<Claims extends readonly ClaimDescriptor[]> = {
    readonly [Descriptor in Claims[number] as Descriptor["key"]]: PolicyOperand<"claim", ClaimValue<Descriptor>>;
};
type RolePredicates<Roles extends readonly string[]> = {
    readonly [Role in Roles[number]]: AuthExpr;
};
export type PolicySession<Roles extends readonly string[], Claims extends readonly ClaimDescriptor[]> = {
    readonly subject: PolicyOperand<"subject", string>;
    readonly claims: ClaimOperands<Claims>;
    readonly roles: RolePredicates<Roles>;
    readonly hasRole: (role: Roles[number]) => AuthExpr;
};
export type PolicyReadMethods<Proxy> = {
    readonly where: (expr: AuthExpr | ((row: Proxy) => AuthExpr)) => void;
    readonly denyWhere: (expr: AuthExpr | ((row: Proxy) => AuthExpr)) => void;
    readonly always: () => void;
    readonly never: () => void;
};
export type PolicyOperationMethods = {
    readonly where: (expr: AuthExpr) => void;
    readonly denyWhere: (expr: AuthExpr) => void;
    readonly always: () => void;
    readonly never: () => void;
};
type OperationsOf<Owner> = Owner extends {
    readonly [OwnedOperations]: infer Operations extends Readonly<Record<string, AnyOwnedOperation>>;
} ? Operations : {};
type FieldsOf<Owner> = Owner extends {
    readonly fields: infer Fields extends Readonly<Record<string, unknown>>;
} ? Fields : {};
type OwnerPolicy<Owner extends AnyEntity | AnyTrait> = {
    readonly read: PolicyReadMethods<AuthPathProxy<FieldsOf<Owner>>>;
    readonly fields: {
        readonly [K in keyof FieldsOf<Owner>]: {
            readonly read: PolicyReadMethods<AuthPathProxy<FieldsOf<Owner>>>;
        };
    };
    readonly operations: {
        readonly [K in keyof OperationsOf<Owner>]: PolicyOperationMethods;
    };
};
type TraitPolicyEntry<Trait> = Trait extends AnyTrait ? {
    readonly [Name in Trait["ns"]]: OwnerPolicy<Trait>;
} : unknown;
type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (value: infer Intersection) => void ? Intersection : never;
type TraitPolicy<Es extends EntityMap> = UnionToIntersection<TraitPolicyEntry<ReachableTrait<Es>>>;
export type SchemaPolicy<Es extends EntityMap> = {
    readonly [K in keyof Es]: OwnerPolicy<Es[K]>;
} & TraitPolicy<Es>;
export type SchemaPolicyConfig<Es extends EntityMap, Roles extends readonly string[] = readonly [], Claims extends readonly ClaimDescriptor[] = readonly []> = {
    readonly principal?: SchemaPrincipalField<Es>;
    readonly roles?: Roles;
    readonly claims?: Claims;
};
export type PolicyContext<Es extends EntityMap, Roles extends readonly string[], Claims extends readonly ClaimDescriptor[]> = {
    readonly policy: SchemaPolicy<Es>;
    readonly actor: PolicyOperand<"me">;
    readonly session: PolicySession<Roles, Claims>;
    readonly allOf: (first: AuthExpr, ...rest: readonly AuthExpr[]) => AuthExpr;
};
export type PolicyDefinition<Es extends EntityMap, Roles extends readonly string[], Claims extends readonly ClaimDescriptor[]> = (context: PolicyContext<Es, Roles, Claims>) => void;
export interface ApplyPolicy<Es extends EntityMap> {
    (define: PolicyDefinition<Es, readonly [], readonly []>): void;
    <const Roles extends readonly string[] = readonly [], const Claims extends readonly ClaimDescriptor[] = readonly []>(config: SchemaPolicyConfig<Es, Roles, Claims>, define: PolicyDefinition<Es, Roles, Claims>): void;
}
export declare function collectSchemaPolicy<Es extends EntityMap>(schema: Schema<string, Es>, define: PolicyDefinition<Es, readonly [], readonly []>): CompileReadAuthorizationInput;
export declare function collectSchemaPolicy<Es extends EntityMap, const Roles extends readonly string[] = readonly [], const Claims extends readonly ClaimDescriptor[] = readonly []>(schema: Schema<string, Es>, config: SchemaPolicyConfig<Es, Roles, Claims>, define: PolicyDefinition<Es, Roles, Claims>): CompileReadAuthorizationInput;
export {};
//# sourceMappingURL=policy.d.ts.map