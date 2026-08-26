/** Composition of entities; the typed client's type parameter. */
import type { AnyEntity } from "./Entity.ts";
import { type EntitiesFromArray, type ValidEntityList, type ValidEntityMap, type ValidMerge } from "./IdentName.ts";
export type EntityMap = Record<string, AnyEntity>;
export interface Schema<Es extends EntityMap = EntityMap> {
    readonly _tag: "Schema";
    readonly entities: Es;
}
/** @internal The public spelling is {@link Schema.Any}. */
export type AnySchema = Schema<EntityMap>;
/**
 * Compose entities into a schema. Address fields via `User.name`.
 *
 * Object form requires each key to equal that entity's name, so a policy's
 * `ns.todo` and the wire prefix `:todo/*` cannot drift. Array form keys
 * each entity by its own name: `Schema([User, Label])` is
 * `{ user: User, label: Label }`.
 */
export declare function Schema<const Es extends readonly AnyEntity[]>(entities: ValidEntityList<Es>): Schema<EntitiesFromArray<Es>>;
export declare function Schema<const Es extends EntityMap>(entities: ValidEntityMap<Es>): Schema<Es>;
export declare namespace Schema {
    /** Any schema — the bound for schema-generic helpers. */
    type Any = Schema<EntityMap>;
}
/** Concatenate schemas. Overlapping entity names are rejected. */
export declare const merge: <const A extends EntityMap, const B extends EntityMap>(left: Schema<A>, right: Schema<ValidMerge<A, B>>) => Schema<A & B>;
export type EntityOf<C extends AnySchema, K extends keyof C["entities"]> = C["entities"][K];
//# sourceMappingURL=Schema.d.ts.map