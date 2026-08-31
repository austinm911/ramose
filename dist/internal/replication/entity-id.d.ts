import { type ServerSealingKey } from "./server-identity.ts";
export declare const ENTITY_ID_CODEC_VERSION = 1;
export declare const SEALED_ENTITY_ID_MIN_LENGTH: number;
export declare const SEALED_ENTITY_ID_PATTERN: RegExp;
export type SealedEntityId = string;
export type EntityIdScope = {
    readonly server: string;
    readonly principal: string;
    readonly database: string;
};
export type EntityIdResolution = {
    readonly type: "resolved";
    readonly eid: number;
    readonly scope: EntityIdScope;
} | {
    readonly type: "update-required";
    readonly reason: "codec-version" | "key-epoch";
} | {
    readonly type: "denied";
};
export declare const sealEntityId: (sealing: ServerSealingKey, scope: EntityIdScope, eid: number) => Promise<SealedEntityId>;
export declare const openEntityId: (sealing: ServerSealingKey, scope: EntityIdScope, token: string) => Promise<EntityIdResolution>;
//# sourceMappingURL=entity-id.d.ts.map