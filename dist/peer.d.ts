import type { Bucket } from "alchemy/Cloudflare/R2";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
/**
 * Compatibility date and flags every Ramose peer Worker is deployed with.
 * One value — do not copy a date into a stack file.
 */
export declare const PEER_COMPAT: {
    date: string;
    flags: Array<"nodejs_compat" | "global_fetch_strictly_public">;
};
export declare const PEER_BINDINGS: {
    readonly store: "STORE";
    readonly transactor: "TRANSACTOR";
    readonly replica: "REPLICA";
    readonly versionMetadata: "CF_VERSION_METADATA";
    readonly internalSecret: "RAMOSE_INTERNAL_SECRET";
};
export declare const PEER_DO_CLASSES: {
    readonly transactor: "TransactorDO";
    readonly replica: "QueryReplicaDO";
};
export declare const PEER_DEFAULTS: {
    readonly storage: "Store";
    readonly worker: "Peer";
};
export type PeerStorage = string | Bucket | Effect.Effect<Bucket, unknown, unknown>;
export type OwnedPeerOptions = {
    readonly storage?: PeerStorage | undefined;
    readonly main?: string | undefined;
    readonly env?: Record<string, unknown> | undefined;
    readonly name?: string | undefined;
    readonly dev?: {
        readonly port?: number;
    } | undefined;
    readonly peer?: string | undefined;
    readonly routes?: PeerRoute[] | undefined;
};
export type PeerRoute = {
    readonly pattern: string;
    readonly zoneName?: string | undefined;
    readonly zoneId?: string | undefined;
};
export declare const workerEnvOf: (worker: unknown) => Record<string, unknown> | undefined;
export declare const validatePeerWiring: (worker: unknown) => string | undefined;
export declare const ownedPeerDurableObjects: () => {
    transactor: Cloudflare.DurableObjectLike<unknown>;
    replica: Cloudflare.DurableObjectLike<unknown>;
};
export type OwnedPeerDurableObjects = ReturnType<typeof ownedPeerDurableObjects>;
export declare const declareOwnedPeer: (options: OwnedPeerOptions & {
    readonly authEnv?: Record<string, unknown> | undefined;
    readonly durableObjects?: OwnedPeerDurableObjects | undefined;
}) => Effect.Effect<import("effect/Pipeable").Pipeable & import("alchemy").ResourceLike<"Cloudflare.Worker", Cloudflare.WorkerProps<{
    readonly STORE: Bucket;
    readonly TRANSACTOR: Cloudflare.DurableObjectLike<unknown>;
    readonly REPLICA: Cloudflare.DurableObjectLike<unknown>;
    readonly CF_VERSION_METADATA: Cloudflare.VersionMetadataBinding;
    readonly RAMOSE_INTERNAL_SECRET: Redacted.Redacted<string>;
}, Cloudflare.WorkerAssetsConfig | undefined>, {
    workerId: string;
    workerName: string;
    namespace: string | undefined;
    logpush: boolean | undefined;
    url: string | undefined;
    urls: string[];
    domain: {
        name: string;
        aliases: string[];
        redirects: string[];
        zone?: Cloudflare.Zone.Reference;
    } | undefined;
    tags: string[] | undefined;
    durableObjectNamespaces: Record<string, string>;
    accountId: string;
    routes: {
        id: string;
        pattern: string;
        zoneId: string;
    }[];
    crons: string[];
    tailConsumers?: {
        service: string;
    }[] | undefined;
    streamingTailConsumers?: {
        service: string;
    }[] | undefined;
    versionOf?: string | undefined;
    versionId?: string | undefined;
    versionAlias?: string | undefined;
    deploymentId?: string | undefined;
    affinityZoneIds?: string[] | undefined;
    hash?: {
        assets: string | undefined;
        bundle: string | undefined;
        input: string | undefined;
        additionalWorkspaces: string[] | undefined;
        metadata?: string | undefined;
    };
}, {
    bindings?: Cloudflare.WorkerBinding[];
    cache?: Cloudflare.WorkerCache;
    containers?: {
        className: string;
        dev: Cloudflare.DevContainerImage | undefined;
    }[];
    crons?: string[];
    hyperdrives?: Record<string, Required<Cloudflare.Hyperdrive.DevOrigin>>;
    devRemote?: Record<string, boolean>;
}, Cloudflare.Providers> & {
    bind(sid: import("alchemy").Input<string>, binding: import("alchemy").Input<{
        bindings?: Cloudflare.WorkerBinding[];
        cache?: Cloudflare.WorkerCache;
        containers?: {
            className: string;
            dev: Cloudflare.DevContainerImage | undefined;
        }[];
        crons?: string[];
        hyperdrives?: Record<string, Required<Cloudflare.Hyperdrive.DevOrigin>>;
        devRemote?: Record<string, boolean>;
    }>): Effect.Effect<void>;
    bind(template: TemplateStringsArray, ...args: any[]): (binding: import("alchemy").Input<{
        bindings?: Cloudflare.WorkerBinding[];
        cache?: Cloudflare.WorkerCache;
        containers?: {
            className: string;
            dev: Cloudflare.DevContainerImage | undefined;
        }[];
        crons?: string[];
        hyperdrives?: Record<string, Required<Cloudflare.Hyperdrive.DevOrigin>>;
        devRemote?: Record<string, boolean>;
    }>) => Effect.Effect<void>;
} & {
    workerId: import("alchemy").Output<string, never>;
    workerName: import("alchemy").Output<string, never>;
    namespace: import("alchemy").Output<string | undefined, never>;
    logpush: import("alchemy").Output<boolean | undefined, never>;
    url: import("alchemy").Output<string | undefined, never>;
    urls: import("alchemy").Output<string[], never>;
    domain: import("alchemy").Output<{
        name: string;
        aliases: string[];
        redirects: string[];
        zone?: Cloudflare.Zone.Reference;
    } | undefined, never>;
    tags: import("alchemy").Output<string[] | undefined, never>;
    durableObjectNamespaces: import("alchemy/Output").ObjectExpr<Record<string, string>, never>;
    accountId: import("alchemy").Output<string, never>;
    routes: import("alchemy").Output<{
        id: string;
        pattern: string;
        zoneId: string;
    }[], never>;
    crons: import("alchemy").Output<string[], never>;
    tailConsumers: import("alchemy").Output<{
        service: string;
    }[] | undefined, never>;
    streamingTailConsumers: import("alchemy").Output<{
        service: string;
    }[] | undefined, never>;
    versionOf: import("alchemy").Output<string | undefined, never>;
    versionId: import("alchemy").Output<string | undefined, never>;
    versionAlias: import("alchemy").Output<string | undefined, never>;
    deploymentId: import("alchemy").Output<string | undefined, never>;
    affinityZoneIds: import("alchemy").Output<string[] | undefined, never>;
    hash: import("alchemy").Output<{
        assets: string | undefined;
        bundle: string | undefined;
        input: string | undefined;
        additionalWorkspaces: string[] | undefined;
        metadata?: string | undefined;
    } | undefined, never>;
} & Cloudflare.Rpc<{}>, never, Cloudflare.Providers>;
//# sourceMappingURL=peer.d.ts.map