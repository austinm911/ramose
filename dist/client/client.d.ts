import { type AnySchemaDefinition } from "../db/Schema.ts";
import type { DatabaseMutations, MutationNamespace } from "./mutation-schema.ts";
import { type ClientDatabase } from "./database.ts";
import { type Subscription } from "./subscription.ts";
import { type SyncState } from "./sync.ts";
/**
 * One credential and the account it belongs to, produced atomically.
 *
 * `token` is the bearer the server authenticates. `cacheKey` is an
 * application/auth-provider account selector that is stable across ordinary
 * bearer renewal; it is hashed with the server origin and root and never
 * transmitted or persisted raw. It nominates a cache candidate and grants no
 * authority: only an exact prior bearer binding, or the current authenticated
 * response, can make a stored replica observable.
 */
export type AuthCredential = {
    readonly token: string;
    readonly cacheKey: string;
};
/** Called once per activation. May be synchronous or asynchronous. */
export type AuthProvider = () => AuthCredential | Promise<AuthCredential>;
export type ClientOptions<S extends AnySchemaDefinition = AnySchemaDefinition> = {
    readonly url: string;
    readonly root: string;
    readonly catalog: S;
    readonly auth: AuthProvider;
    readonly storageName?: string;
};
export type Client<Mutations = MutationNamespace> = {
    readonly open: () => ClientDatabase<Mutations>;
    readonly sync: Subscription<SyncState>;
    readonly close: () => Promise<void>;
    readonly clearLocalData: () => Promise<void>;
};
/**
 * Bind one server, one configured root route, one installed catalog, and one
 * refreshable credential provider.
 *
 * @throws ClientConfigurationError when any of them cannot be bound. None of
 * these become valid later, so they fail here rather than at the first query.
 */
export declare const createClient: <const S extends AnySchemaDefinition>(options: ClientOptions<S>) => Client<DatabaseMutations<S>>;
//# sourceMappingURL=client.d.ts.map