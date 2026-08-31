import { type ServerIdentityRoot, type ServerSealingKey } from "./server-identity.ts";
export declare const SERVER_IDENTITY_ROOT_NAME = "ramose-server-identity-root-v1";
export type IdentityRootEnv = {
    readonly REPLICA: DurableObjectNamespace;
    readonly RAMOSE_INTERNAL_SECRET: string;
};
export declare const serverIdentityRootId: (env: Pick<IdentityRootEnv, "REPLICA">) => DurableObjectId;
export declare const serverIdentityRoot: (env: IdentityRootEnv) => Promise<ServerIdentityRoot>;
export declare const serverSealingKey: (env: IdentityRootEnv) => Promise<ServerSealingKey>;
export declare const clearServerIdentityRootCache: () => void;
//# sourceMappingURL=identity-root.d.ts.map