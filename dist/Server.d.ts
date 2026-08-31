import type { Worker } from "alchemy/Cloudflare/Workers";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import { type AuthConfig } from "./Auth.ts";
export { DEFAULT_JWT_MAX_TTL } from "./Auth.ts";
import { NetworkError } from "./db/Errors.ts";
import { type PeerRoute, type PeerStorage } from "./peer.ts";
import type { Providers } from "./Providers.ts";
export declare const isServer: (value: unknown) => value is Server;
export type ServerWorker = Worker | {
    readonly url: string | undefined;
    readonly workerName?: string | undefined;
} | string;
export interface ServerProbe {
    readonly attempts?: number;
    readonly delayMs?: number;
    readonly timeoutMs?: number;
    readonly deadlineMs?: number;
}
export declare const PROBE_DEFAULTS: {
    readonly live: {
        readonly attempts: 30;
        readonly delayMs: 2000;
        readonly timeoutMs: 10000;
        readonly deadlineMs: 120000;
    };
    readonly local: {
        readonly attempts: 60;
        readonly delayMs: 250;
        readonly timeoutMs: 2000;
        readonly deadlineMs: 30000;
    };
};
/**
 * A string, or an Alchemy Output / Effect that resolves to one at deploy.
 * Reef's JWKS URL and CORS origins are interpolations over the auth Worker;
 * owned form writes them onto the Worker, hatch form compares by identity.
 */
export type AuthEnvValue = string | object;
/**
 * What the server Worker needs to verify JWTs.
 *
 * When Server owns the Worker, these are applied onto {@link RamoseEnv}.
 * On the escape hatch they are compared against the Worker's env and
 * fail the deploy on divergence — do not configure auth only on the Worker.
 */
export interface ServerAuth {
    readonly jwksUrl?: AuthEnvValue | undefined;
    readonly jwksJson?: AuthEnvValue | undefined;
    readonly jwksService?: string | undefined;
    readonly issuers?: readonly string[] | AuthEnvValue | undefined;
    readonly aud?: string | undefined;
    readonly maxTtl?: number | undefined;
    readonly jwt?: AuthConfig | undefined;
    readonly allowedOrigins?: readonly string[] | AuthEnvValue | undefined;
}
export type ServerProps = {
    worker?: ServerWorker;
    storage?: PeerStorage;
    main?: string;
    env?: Record<string, unknown>;
    name?: string;
    dev?: {
        readonly port?: number;
    };
    peer?: string;
    routes?: PeerRoute[];
    url?: string;
    auth?: ServerAuth;
    probe?: ServerProbe | false;
};
export declare const AUTH_ENV_KEYS: {
    readonly jwksUrl: "RAMOSE_JWKS_URL";
    readonly jwksJson: "RAMOSE_JWKS_JSON";
    readonly jwksService: "RAMOSE_JWKS_SERVICE";
    readonly issuers: "RAMOSE_JWT_ISS";
    readonly aud: "RAMOSE_JWT_AUD";
    readonly maxTtl: "RAMOSE_JWT_MAX_TTL";
    readonly allowedOrigins: "RAMOSE_ALLOWED_ORIGINS";
};
export declare const authEnv: (peerAuth: ServerAuth | undefined) => Record<string, unknown>;
export declare const checkAuth: (peerAuth: ServerAuth | undefined) => string | undefined;
export declare const compareAuthToWorker: (peerAuth: ServerAuth | undefined, worker: unknown) => string | undefined;
export type Server = Resource<"Ramose.Server", ServerProps, {
    url: string;
    workerName: string;
}, never, Providers>;
declare const ServerResource: import("alchemy").ResourceClass<Server>;
export declare const Server: typeof ServerResource;
export declare const resolveWorker: (worker: ServerWorker) => {
    url: string | undefined;
    workerName: string;
};
export declare const healthOnce: (url: string, timeoutMs: number) => Effect.Effect<void, NetworkError, never>;
export declare const probeHealth: (url: string, probe: ServerProbe | false | undefined, defaults: Required<ServerProbe>) => Effect.Effect<void, NetworkError, never>;
export declare const ServerProvider: () => import("effect/Layer").Layer<Provider.Provider<Server>, never, import("alchemy").AlchemyContext>;
//# sourceMappingURL=Server.d.ts.map