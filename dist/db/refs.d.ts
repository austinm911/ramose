import type { AnyEntity } from "./Entity.ts";
declare const EntityIdBrand: unique symbol;
declare const ClientRefBrand: unique symbol;
declare const InvocationIdBrand: unique symbol;
export type EntityId<Entity extends AnyEntity = AnyEntity> = string & {
    readonly [EntityIdBrand]: Entity;
};
/**
 * A globally unique client-minted identity for an entity this client intends
 * to create. It is durable: it survives restart, and dependent queued work
 * refers to it until the authoritative mapping arrives.
 */
export type ClientRef<Entity extends AnyEntity = AnyEntity> = string & {
    readonly [ClientRefBrand]: Entity;
};
/** The durable identity of one queued invocation. */
export type InvocationId = string & {
    readonly [InvocationIdBrand]: true;
};
/** What a durable queued mutation may name as its target. */
export type MutationRef<Entity extends AnyEntity = AnyEntity> = EntityId<Entity> | ClientRef<Entity>;
export declare const ENTITY_ID_PATTERN: RegExp;
export declare const ENTITY_ID_CODEC = 1;
export declare const CLIENT_REF_PATTERN: RegExp;
export declare const INVOCATION_ID_PATTERN: RegExp;
/** Mint one durable client ref for an entity that does not exist yet. */
export declare const clientRef: <Entity extends AnyEntity = AnyEntity>() => ClientRef<Entity>;
/** Mint one durable invocation id. Assigned before anything is persisted. */
export declare const invocationId: () => InvocationId;
export declare const isClientRef: (value: unknown) => value is ClientRef;
export declare const isInvocationId: (value: unknown) => value is InvocationId;
/**
 * Shape check only. A well-formed handle is not an authorization claim and is
 * not proof that the ciphertext opens: only the authoritative resolver decides
 * that, and its failure is the ordinary sealed denial.
 */
export declare const isEntityId: (value: unknown) => value is EntityId;
export declare const isMutationRef: (value: unknown) => value is MutationRef;
export declare const unsafeEntityId: <Entity extends AnyEntity = AnyEntity>(value: string) => EntityId<Entity>;
export type EntityIdEnvelope = {
    readonly codecVersion: number;
    readonly keyId: string;
};
export declare const entityIdEnvelope: (value: string) => EntityIdEnvelope | undefined;
export {};
//# sourceMappingURL=refs.d.ts.map