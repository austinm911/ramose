import { type ApplyPolicy } from "../internal/authorization/authoring/policy.ts";
import type { CompileReadAuthorizationInput } from "../internal/authorization/authoring/types.ts";
import type { AnyEntity } from "./Entity.ts";
import { type EntitiesFromArray, type ValidEntityList, type ValidEntityMap, type ValidMerge } from "./IdentName.ts";
import type { AnyTrait } from "./Trait.ts";
export type EntityMap = Record<string, AnyEntity>;
export interface SchemaShape<Es extends EntityMap = EntityMap> {
    readonly _tag: "Schema";
    readonly entities: Es;
}
export interface Schema<Key extends string = string, Es extends EntityMap = EntityMap> extends SchemaShape<Es> {
    readonly key: Key;
    readonly schema: Schema<Key, Es>;
    readonly applyPolicy: ApplyPolicy<Es>;
}
export type AnySchema = SchemaShape<EntityMap>;
export type AnySchemaDefinition = Schema<string, EntityMap>;
export declare const SCHEMA_POLICY: unique symbol;
/**
 * Define a named schema. Address fields via `User.name`.
 *
 * Object form requires each key to equal that entity's name, so a policy's
 * `ns.todo` and the wire prefix `:todo/*` cannot drift. Array form keys
 * each entity by its own name: `Schema("app", [User, Label])` is
 * `{ user: User, label: Label }`.
 */
export declare function Schema<const Key extends string, const Es extends readonly AnyEntity[]>(key: Key, entities: ValidEntityList<Es>): Schema<Key, EntitiesFromArray<Es>>;
export declare function Schema<const Key extends string, const Es extends EntityMap>(key: Key, entities: ValidEntityMap<Es>): Schema<Key, Es>;
export declare namespace Schema {
    type Any = Schema<string, EntityMap>;
}
export declare const merge: <const Key extends string, const A extends EntityMap, const B extends EntityMap>(key: Key, left: Schema<string, A>, right: Schema<string, ValidMerge<A, B>>) => Schema<Key, A & B>;
export declare const appliedPolicyOf: (schema: AnySchemaDefinition) => CompileReadAuthorizationInput | undefined;
export declare const isSchemaDefinition: (value: unknown) => value is AnySchemaDefinition;
export type EntityOf<C extends AnySchema, K extends keyof C["entities"]> = C["entities"][K];
export declare const schemaTraits: (schema: AnySchema) => ReadonlyMap<string, AnyTrait>;
//# sourceMappingURL=Schema.d.ts.map