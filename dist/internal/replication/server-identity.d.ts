export declare const SERVER_IDENTITY_ROOT_VERSION = 1;
export declare const SERVER_IDENTITY_KEY_ID: RegExp;
export type ServerIdentityRoot = {
    readonly version: typeof SERVER_IDENTITY_ROOT_VERSION;
    readonly keyId: string;
    readonly key: string;
    readonly createdAt: number;
};
export type ServerSealingKey = {
    readonly keyId: string;
    readonly material: string;
};
declare const ServerIdentityUnavailable_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ServerIdentityUnavailable";
} & Readonly<A>;
export declare class ServerIdentityUnavailable extends ServerIdentityUnavailable_base<{
    readonly reason: string;
    readonly cause?: unknown;
}> {
}
declare const ServerIdentityIncompatible_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ServerIdentityIncompatible";
} & Readonly<A>;
export declare class ServerIdentityIncompatible extends ServerIdentityIncompatible_base<{
    readonly persisted: string;
    readonly current: string;
}> {
}
export declare const base64Url: (bytes: Uint8Array) => string;
export declare const generateServerIdentityRoot: (createdAt: number) => ServerIdentityRoot;
export declare const decodeServerIdentityRoot: (value: unknown) => ServerIdentityRoot | undefined;
export type ServerIdentityRootRead = {
    readonly type: "existing";
    readonly root: ServerIdentityRoot;
} | {
    readonly type: "absent";
} | {
    readonly type: "unreadable";
};
export declare const readServerIdentityRootRecord: (stored: unknown) => ServerIdentityRootRead;
export declare const sealingKeyOf: (root: ServerIdentityRoot) => ServerSealingKey;
export type ServerIdentityBinding = {
    readonly type: "adopt";
} | {
    readonly type: "compatible";
} | {
    readonly type: "incompatible";
    readonly persisted: string;
};
export declare const decideServerIdentityBinding: (persistedKeyId: string | undefined, currentKeyId: string) => ServerIdentityBinding;
export declare const SERVER_IDENTITY_INCOMPATIBLE = "server-identity-incompatible";
export declare const SERVER_IDENTITY_UNREADABLE = "server-identity-unreadable";
export {};
//# sourceMappingURL=server-identity.d.ts.map