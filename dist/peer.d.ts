/**
 * The peer Worker the Server owns: pinned compat, fixed binding names,
 * Durable Object class names, and deploy-time validation of the escape hatch.
 *
 * A typo'd `className` used to pass `/health` and die on the first transact.
 * {@link validatePeerWiring} is what makes that a deploy error instead.
 */
import type { Bucket } from "alchemy/Cloudflare/R2";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
/**
 * Compatibility date and flags every Ramose peer Worker is deployed with.
 * One value — do not copy a date into a stack file.
 */
export declare const PEER_COMPAT: {
    date: string;
    flags: Array<"nodejs_compat">;
};
/** Env keys the peer Worker and both DO classes read. */
export declare const PEER_BINDINGS: {
    readonly store: "STORE";
    readonly transactor: "TRANSACTOR";
    readonly replica: "REPLICA";
};
/** Durable Object `className`s the `ramose/worker` entry exports. */
export declare const PEER_DO_CLASSES: {
    readonly transactor: "TransactorDO";
    readonly replica: "QueryReplicaDO";
};
/** Default Alchemy logical ids when Server declares the peer. */
export declare const PEER_DEFAULTS: {
    readonly storage: "Store";
    readonly worker: "Peer";
};
export type PeerStorage = string | Bucket | Effect.Effect<Bucket, unknown, unknown>;
export type OwnedPeerOptions = {
    /** R2 bucket, or the logical id to declare. @default `"Store"` */
    readonly storage?: PeerStorage | undefined;
    /**
     * Peer entry module. Defaults to {@link workerEntry} (`ramose/worker`).
     * A custom `createServer({ operations })` module belongs here — that is
     * still Server-owned (DOs, bindings, compat are not yours to name).
     */
    readonly main?: string | undefined;
    /**
     * Extra env bindings (AUTH, ANALYTICS, tuning). Merged after the fixed
     * peer bindings and before auth — `Server({ auth, token })` wins.
     */
    readonly env?: Record<string, unknown> | undefined;
    /** Physical Worker name override (Alchemy's `name`). */
    readonly name?: string | undefined;
    /** Local-dev port for the peer proxy. */
    readonly dev?: {
        readonly port?: number;
    } | undefined;
    /** Alchemy logical id of the Worker resource. @default `"Peer"` */
    readonly peer?: string | undefined;
    /** Zone routes on the owned Worker (`/db/*` on a custom hostname). */
    readonly routes?: PeerRoute[] | undefined;
};
/** Zone route passed through to `Cloudflare.Worker`. */
export type PeerRoute = {
    readonly pattern: string;
    readonly zoneName?: string | undefined;
    readonly zoneId?: string | undefined;
};
/**
 * @internal The Worker's env bag, or `undefined` when the value is a URL
 * (nothing to compare or validate).
 */
export declare const workerEnvOf: (worker: unknown) => Record<string, unknown> | undefined;
/**
 * Deploy-time check of a user-owned Worker. Returns an error message, or
 * `undefined` when the worker is not a Cloudflare Worker (a URL, or
 * `{ url }`) — those forms have no bindings to validate.
 */
export declare const validatePeerWiring: (worker: unknown) => string | undefined;
/**
 * The two Durable Object *declarations* a hand-written stack writes at
 * module scope (`Cloudflare.DurableObject("TransactorDO", …)`). Alchemy
 * scopes a declaration created while evaluating `Worker({ env })` as a
 * nested binding (`[Worker/TRANSACTOR]`) and never gives it its own
 * logical id — the working e2e stack and Reef both declare these as
 * siblings of the Worker instead.
 *
 * Call this from `Ramose.Server(…)` itself (stack-module evaluation),
 * not from inside Worker's env literal.
 */
export declare const ownedPeerDurableObjects: () => {
    transactor: Cloudflare.DurableObjectLike<unknown>;
    replica: Cloudflare.DurableObjectLike<unknown>;
};
export type OwnedPeerDurableObjects = ReturnType<typeof ownedPeerDurableObjects>;
/**
 * Declare the R2 bucket, both DO classes, and the peer Worker. The caller
 * `yield*`s this from Server's init so Alchemy tracks the dependencies
 * through the Worker's env (the same pattern as a hand-written stack).
 */
export declare const declareOwnedPeer: (options: OwnedPeerOptions & {
    readonly authEnv?: Record<string, unknown> | undefined;
    /** Pre-declared at the `Server()` call site so they are stack-level siblings. */
    readonly durableObjects?: OwnedPeerDurableObjects | undefined;
}) => Effect.Effect<import("effect/Pipeable").Pipeable & import("alchemy").ResourceLike<"Cloudflare.Worker", Cloudflare.WorkerProps<{
    readonly STORE: Bucket;
    readonly TRANSACTOR: Cloudflare.DurableObjectLike<unknown>;
    readonly REPLICA: Cloudflare.DurableObjectLike<unknown>;
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